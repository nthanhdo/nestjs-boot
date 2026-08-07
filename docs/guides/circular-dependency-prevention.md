# Circular Dependency Prevention Guide

> **nestjs-boot** treats circular dependencies as a design problem, not a runtime problem.
> This guide gives you copy-paste patterns to eliminate them.

---

## Why Circular Dependencies Happen

Five architectural forces create cycles as your NestJS app grows:

| Force | Example | Frequency |
|-------|---------|-----------|
| **Shared services** | `UserService` needed everywhere; eventually needs `OrderService` back | Very common at 20+ modules |
| **Guards importing business** | `AuthGuard` needs `UserService`; `UserModule` needs `AuthGuard` | Common |
| **Side-effect listeners** | `NotificationModule` listens to `OrderCreated`, needs order details | Common |
| **God-modules** | `SharedModule` absorbs too many deps, creates transitive cycles | Gradual |
| **Barrel files** | `index.ts` re-exports cause reference-before-define (`undefined` in imports) | Subtle |

At 5 modules you have ~5% chance of a cycle. At 30 modules, ~60%. At 50+, it is almost certain.

---

## Decision Tree: Which Pattern to Use?

```
Is the cross-module call a SIDE-EFFECT?
(e.g., "send notification after order created")
│
├── YES ──► Pattern 1: Fire-and-Forget Event
│           eventBus.emit(new OrderCreatedEvent(...))
│
└── NO ── Do you NEED a return value?
          │
          ├── YES ──► Pattern 2: Query via emitAndWait()
          │           const user = await eventBus.emitAndWait(new GetUserByIdQuery(id))
          │
          └── NO ── Is it a cross-cutting concern (auth, logging, caching)?
                    │
                    ├── YES ──► Pattern 3: Contract / Token Injection
                    │           @Inject(USER_LOOKUP) private userLookup: IUserLookup
                    │
                    └── NO ── Is it a temporary workaround while refactoring?
                              │
                              ├── YES ──► Pattern 4: forwardRef() (last resort)
                              │
                              └── NO ──► Pattern 5: Module Layering (restructure)
```

---

## Pattern 1: Replace Direct Calls with Events (fire-and-forget)

**Use when:** The caller does not need a return value. The cross-module call is a side-effect (notification, analytics, audit log, counter increment).

### Before (circular dependency)

```ts
// order/order.service.ts
import { UserService } from '../user/user.service';           // <- requires UserModule import
import { NotificationService } from '../notification/notification.service'; // <- requires NotificationModule import

@Injectable()
export class OrderService {
  constructor(
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
  ) {}

  async createOrder(userId: string, items: Item[]) {
    const user = await this.userService.findById(userId);
    const order = await this.orderRepo.create({ userId, items });

    // Side-effects that create circular deps:
    await this.notificationService.sendOrderConfirmation(user, order);
    await this.userService.incrementOrderCount(userId);

    return order;
  }
}
```

```ts
// order/order.module.ts
@Module({
  imports: [UserModule, NotificationModule], // <- edges that create cycles
  providers: [OrderService],
})
export class OrderModule {}
```

### After (event-driven, zero cross-module imports)

**Step 1: Define the event**

```ts
// order/events/order-created.event.ts
import { BootEvent } from 'nestjs-boot';

export class OrderCreatedEvent extends BootEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly items: Item[],
  ) {
    super();
  }
}
```

**Step 2: Emit the event (no import of UserModule or NotificationModule)**

```ts
// order/order.service.ts
import { EventBusService } from 'nestjs-boot';
import { OrderCreatedEvent } from './events/order-created.event';

@Injectable()
export class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async createOrder(userId: string, items: Item[]) {
    const order = await this.orderRepo.create({ userId, items });

    // Fire-and-forget: no cross-module import needed
    await this.eventBus.emit(new OrderCreatedEvent(order.id, userId, items));

    return order;
  }
}
```

**Step 3: Listen in each module (no import of OrderModule)**

```ts
// user/handlers/user-event-handlers.service.ts
import { Injectable } from '@nestjs/common';
import { OnEvent } from 'nestjs-boot';
import { OrderCreatedEvent } from '../../order/events/order-created.event';

@Injectable()
export class UserEventHandlers {
  constructor(private readonly userService: UserService) {}

  @OnEvent(OrderCreatedEvent)
  async onOrderCreated(event: OrderCreatedEvent) {
    await this.userService.incrementOrderCount(event.userId);
  }
}
```

```ts
// notification/handlers/notification-event-handlers.service.ts
@Injectable()
export class NotificationEventHandlers {
  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(OrderCreatedEvent)
  async onOrderCreated(event: OrderCreatedEvent) {
    await this.notificationService.sendOrderConfirmation(event.userId, event.orderId);
  }
}
```

**Step 4: Update modules (clean DAG)**

```ts
// order/order.module.ts — NO imports of UserModule or NotificationModule
@Module({
  providers: [OrderService],
})
export class OrderModule {}

// user/user.module.ts — NO imports of OrderModule
@Module({
  providers: [UserService, UserEventHandlers],
})
export class UserModule {}
```

**Dependency graph:**
```
BEFORE (cycles):                     AFTER (DAG):
OrderModule <--> UserModule          OrderModule ----> EventBusModule (@Global)
OrderModule <--> NotificationModule                        |
                                                     +-----+-----+
                                                     v           v
                                                 UserModule   NotifModule
                                                 (listens)    (listens)
```

---

## Pattern 2: Query via emitAndWait() (request/reply)

**Use when:** You NEED a return value from another module but don't want the direct import that creates a circular dependency. This is the most important pattern for breaking cycles.

### Before (circular dependency)

```ts
// order/order.service.ts
import { UserService } from '../user/user.service'; // <- circular dep

@Injectable()
export class OrderService {
  constructor(private readonly userService: UserService) {}

  async createOrder(userId: string, items: Item[]) {
    // NEED the user object back — can't use fire-and-forget
    const user = await this.userService.findById(userId);
    if (!user.isActive) throw new ForbiddenException('Inactive user');

    return this.orderRepo.create({ userId, items, userName: user.name });
  }
}
```

### After (emitAndWait, zero cross-module imports)

**Step 1: Define the query (extends BootQuery, not BootEvent)**

```ts
// shared/queries/get-user-by-id.query.ts
import { BootQuery } from 'nestjs-boot';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export class GetUserByIdQuery extends BootQuery<UserDto> {
  constructor(public readonly userId: string) {
    super();
  }
}
```

**Step 2: Handle the query in UserModule**

```ts
// user/handlers/user-query-handlers.service.ts
import { Injectable } from '@nestjs/common';
import { OnQuery } from 'nestjs-boot';
import { GetUserByIdQuery, UserDto } from '../../shared/queries/get-user-by-id.query';

@Injectable()
export class UserQueryHandlers {
  constructor(private readonly userService: UserService) {}

  @OnQuery(GetUserByIdQuery)
  async handleGetUser(query: GetUserByIdQuery): Promise<UserDto> {
    return this.userService.findById(query.userId);
  }
}
```

**Step 3: Call via emitAndWait in OrderModule**

```ts
// order/order.service.ts — NO import of UserModule
import { EventBusService } from 'nestjs-boot';
import { GetUserByIdQuery, UserDto } from '../shared/queries/get-user-by-id.query';

@Injectable()
export class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async createOrder(userId: string, items: Item[]) {
    // Request/reply — gets the user back without importing UserModule
    const user = await this.eventBus.emitAndWait<UserDto>(
      new GetUserByIdQuery(userId),
      { timeout: 5000 },
    );

    if (!user.isActive) throw new ForbiddenException('Inactive user');
    return this.orderRepo.create({ userId, items, userName: user.name });
  }
}
```

**Key points:**
- `emitAndWait` throws if no handler is registered (with a helpful error message)
- `emitAndWait` throws if the handler doesn't respond within the timeout
- Only ONE handler per query class (unlike events which can have multiple listeners)
- The `shared/queries/` directory has zero module imports — it's a leaf node

---

## Pattern 3: Contract / Token Injection

**Use when:** You have a cross-cutting concern (auth checking, user lookup) used by many modules. The interface lives in a shared location with zero dependencies.

```ts
// shared/contracts/user-lookup.contract.ts (ZERO dependencies)
export interface IUserLookup {
  findById(id: string): Promise<{ id: string; name: string; email: string }>;
}

export const USER_LOOKUP = 'IUserLookup';
```

```ts
// user/user.module.ts — provides the implementation
@Module({
  providers: [
    UserService,
    { provide: USER_LOOKUP, useExisting: UserService }, // UserService implements IUserLookup
  ],
  exports: [USER_LOOKUP],
})
export class UserModule {}
```

```ts
// order/order.service.ts — consumes via token, NO import of UserModule
import { Inject, Injectable } from '@nestjs/common';
import { IUserLookup, USER_LOOKUP } from '../shared/contracts/user-lookup.contract';

@Injectable()
export class OrderService {
  constructor(@Inject(USER_LOOKUP) private readonly userLookup: IUserLookup) {}

  async getOrderWithUser(orderId: string) {
    const order = await this.orderRepo.findById(orderId);
    const user = await this.userLookup.findById(order.userId);
    return { ...order, user };
  }
}
```

**When to use this vs emitAndWait:**
- Contract pattern: when the dependency is **synchronous-feeling** and the providing module is always present
- `emitAndWait`: when the modules should be **fully decoupled** (e.g., different teams, optional modules)

---

## Pattern 4: forwardRef() (last resort)

**Use when:** You need a quick fix while refactoring to a proper pattern. `forwardRef` is a band-aid, not a solution.

```ts
// user/user.module.ts
@Module({
  imports: [forwardRef(() => OrderModule)],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

// order/order.module.ts
@Module({
  imports: [forwardRef(() => UserModule)],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
```

**When NOT to use forwardRef:**
- More than 2 `forwardRef` pairs in your app = structural problem, fix with Pattern 1/2/3
- Transitive cycles (A -> B -> C -> A) = `forwardRef` cannot solve these
- Tests become harder to isolate with `forwardRef`

---

## Pattern 5: Module Layering

Organize modules into layers where dependencies only flow downward:

```
Layer 0: Infrastructure  (@Global — DB, Cache, EventBus, Auth)
    ^
Layer 1: Domain/Core     (entities, value objects, contracts)
    ^
Layer 2: Feature          (User, Order, Payment — import Layer 0+1 only)
    ^
Layer 3: Orchestration    (Saga, Workflow — import Layer 0+1+2)
    ^
Layer 4: Presentation     (Controllers, Gateways — import any layer)
```

**Rule:** Feature modules (Layer 2) never import each other directly. They communicate via EventBusModule (Layer 0) or shared contracts (Layer 1).

---

## Anti-Patterns (what NOT to do)

### 1. God-module
```ts
// DO NOT: SharedModule that imports half the app
@Module({
  imports: [UserModule, OrderModule, PaymentModule, NotificationModule, AnalyticsModule],
  exports: [UserModule, OrderModule, PaymentModule, NotificationModule, AnalyticsModule],
})
export class SharedModule {} // <- This IS the problem
```

### 2. Barrel file re-export everything
```ts
// DO NOT: modules/index.ts
export * from './user/user.module';
export * from './order/order.module';
// TypeScript evaluates top-to-bottom; one gets undefined
```

### 3. Guard importing business service directly
```ts
// DO NOT: AuthGuard depends on full UserService
@Injectable()
export class AuthGuard {
  constructor(private readonly userService: UserService) {} // <- UserModule import needed
}

// DO: AuthGuard depends on a minimal contract
@Injectable()
export class AuthGuard {
  constructor(@Inject(USER_LOOKUP) private readonly userLookup: IUserLookup) {}
}
```

### 4. Ignoring nestjs-boot warnings
In dev mode, nestjs-boot scans the module graph after boot and warns about:
- **Mutual imports** (Module A imports Module B AND B imports A)
- **God-module smell** (any module importing >10 others)

These warnings are non-blocking but indicate architectural risk. Fix them before they become circular dep crashes.

---

## Checklist: 5 Signs Your Codebase Has Circular Dep Risk

- [ ] You have any `forwardRef()` in your codebase
- [ ] A single module is imported by more than 8 other modules
- [ ] Your `SharedModule` or `CommonModule` has grown beyond utilities
- [ ] Guards or interceptors inject business services (not contracts)
- [ ] Adding a new feature module requires changing 3+ existing modules' imports

If you checked 2+ boxes, apply Patterns 1-3 from this guide proactively.

---

## Quick Reference

| I need to... | Use | Import needed? |
|---|---|---|
| Notify another module (no response needed) | `eventBus.emit(new XxxEvent(...))` | Only the event class (leaf file) |
| Get data from another module | `eventBus.emitAndWait(new XxxQuery(...))` | Only the query class (leaf file) |
| Inject a cross-cutting service | `@Inject(TOKEN) private svc: IContract` | Only the contract file (leaf file) |
| Quick fix while refactoring | `forwardRef(() => OtherModule)` | The full module (temporary) |
