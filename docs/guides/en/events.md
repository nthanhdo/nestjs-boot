# Event Bus

nestjs-boot provides an in-process (or Redis-distributed) event bus for typed publish/subscribe and request/reply patterns. Unlike the [CQRS DomainEvent system](cqrs-event-sourcing.md) (which is for event sourcing and persistence), the EventBus is for real-time in-process communication and breaking circular dependencies between modules.

## Setup

```ts
import { BootModule } from 'nestjs-boot';

// In-memory (single process)
BootModule.register({
  events: { transport: 'memory' },
});

// Redis (cross-service)
BootModule.register({
  events: {
    transport: 'redis',
    redis: { url: 'redis://localhost:6379' },
  },
});
```

Or standalone:

```ts
import { EventBusModule } from 'nestjs-boot/events';

EventBusModule.register({ transport: 'memory' })
```

The module registers globally. `EventBusService` is available via standard DI.

You can also inject a pre-created Redis client (e.g., shared from CacheModule) via `redisClient: { publisher, subscriber }` to avoid creating duplicate connections.

## BootEvent

Base class for all typed events. Automatically captures a `timestamp` and `correlationId` (from AsyncLocalStorage if the correlation module is loaded).

```ts
import { BootEvent } from 'nestjs-boot/events';

class OrderCreatedEvent extends BootEvent {
  constructor(
    public readonly orderId: string,
    public readonly total: number,
  ) { super(); }
}
```

## Emitting Events

`EventBusService` provides three emission methods:

```ts
import { EventBusService } from 'nestjs-boot/events';

@Injectable()
class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async createOrder(dto: CreateOrderDto) {
    const order = await this.save(dto);

    // Fire-and-forget -- handlers run in background
    await this.eventBus.emit(new OrderCreatedEvent(order.id, order.total));

    // Wait for ALL handlers to complete
    await this.eventBus.emitAsync(new OrderCreatedEvent(order.id, order.total));

    return order;
  }
}
```

| Method | Behavior |
|--------|----------|
| `emit(event)` | Fires handlers in the background. Async handler errors are logged but do not propagate. |
| `emitAsync(event)` | Awaits all handlers via `Promise.all`. Errors propagate to the caller. |

With Redis transport, both methods publish to the `boot:events` channel in addition to invoking local handlers, enabling cross-service event distribution.

## @OnEvent Decorator

Marks a method as a handler for a specific event class:

```ts
import { OnEvent } from 'nestjs-boot/events';

@Injectable()
class NotificationService {
  @OnEvent(OrderCreatedEvent)
  handleOrderCreated(event: OrderCreatedEvent) {
    console.log(`Order ${event.orderId} created for $${event.total}`);
  }

  @OnEvent(OrderCreatedEvent, { async: true })
  async sendEmail(event: OrderCreatedEvent) {
    // Runs fire-and-forget even with emitAsync
    await this.mailer.send(event.orderId);
  }
}
```

The `async: true` option marks the handler as fire-and-forget: errors are logged but never block the emitter, even when using `emitAsync`.

Multiple handlers can subscribe to the same event class (fan-out).

## BootQuery and Request/Reply

`BootQuery<TResult>` extends `BootEvent` for scenarios where you need a return value. This is the primary mechanism for breaking circular dependencies between modules.

### Define a Query

```ts
import { BootQuery } from 'nestjs-boot/events';

class GetUserByIdQuery extends BootQuery<User> {
  constructor(public readonly userId: string) { super(); }
}
```

### Handle the Query

```ts
import { OnQuery } from 'nestjs-boot/events';

@Injectable()
class UserQueryHandler {
  constructor(private readonly userService: UserService) {}

  @OnQuery(GetUserByIdQuery)
  async handle(query: GetUserByIdQuery): Promise<User> {
    return this.userService.findById(query.userId);
  }
}
```

Only **one** handler per query class is allowed. If a second handler is registered, the first is overwritten with a warning.

### Emit and Wait

```ts
const user = await this.eventBus.emitAndWait<User>(
  new GetUserByIdQuery(userId),
  { timeout: 5000 },  // default: 5000ms
);
```

`emitAndWait` throws if no handler is registered or if the handler does not respond within the timeout.

## Breaking Circular Dependencies

The event bus is the recommended solution when Module A needs data from Module B, but Module B already imports Module A.

**Before** (circular dependency):

```ts
// order.service.ts -- imports UserService directly
@Injectable()
class OrderService {
  constructor(private readonly userService: UserService) {} // circular!
}
```

**After** (event bus query):

```ts
// order.service.ts -- no import of UserModule
@Injectable()
class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async createOrder(dto: CreateOrderDto) {
    const user = await this.eventBus.emitAndWait<User>(
      new GetUserByIdQuery(dto.userId),
    );
    // use user...
  }
}

// user-query.handler.ts -- in UserModule
@Injectable()
class UserQueryHandler {
  constructor(private readonly userService: UserService) {}

  @OnQuery(GetUserByIdQuery)
  handle(query: GetUserByIdQuery) {
    return this.userService.findById(query.userId);
  }
}
```

The query class (`GetUserByIdQuery`) lives in a shared module or a dedicated `contracts/` directory imported by both sides. Neither module imports the other.

## Transport Comparison

| Feature | Memory | Redis |
|---------|--------|-------|
| Cross-service | No | Yes |
| Latency | Microseconds | Network round-trip |
| Persistence | No | No (pub/sub is fire-and-forget) |
| Dependencies | None | `ioredis` |
| `emitAndWait` | Yes | Local handlers only |

If `ioredis` is not installed when using Redis transport, the service logs a warning and falls back to memory transport.

## Best Practices

- Use `emit` (fire-and-forget) for side effects that should not block the caller (notifications, analytics)
- Use `emitAsync` when you need to guarantee all handlers completed before responding (cache invalidation, audit logging)
- Use `emitAndWait` (queries) to break circular dependencies instead of `forwardRef`
- Keep query handlers fast; set appropriate timeouts for slow operations
- Define event and query classes in a shared contracts module to avoid coupling
- Prefer memory transport for single-process apps; use Redis only when you need cross-service distribution

## See also

- [Circular Dependency Prevention](circular-dependency-prevention.md) — event bus patterns to eliminate circular deps
- [CQRS & Event Sourcing](cqrs-event-sourcing.md) — `DomainEvent` for persistent event sourcing (different from EventBus)
- [Queue (BullMQ)](queue.md) — for durable job processing (vs EventBus fire-and-forget)
