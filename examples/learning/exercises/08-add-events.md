# Exercise 08: Emit an OrderCreated Event

**Objective:** When an order is created, emit an event that other parts of the app can react to.

## Context

Events decouple producers from consumers. The Order service says "an order was created" without knowing or caring who's listening. Listeners might send an email, update analytics, reduce inventory, etc.

## Steps

1. **Enable events** in `main.ts`:

```typescript
const app = await createApp(AppModule, {
  // ... existing config ...
  events: {
    driver: 'memory',  // in-memory for development (use 'redis' for production)
  },
});
```

2. **Edit `src/order/order.service.ts`:**
   - Import `EventBusService` from `nestjs-boot`
   - Inject it in the constructor
   - After saving an order, emit an event:

```typescript
import { EventBusService } from 'nestjs-boot';

// In constructor:
private readonly eventBus: EventBusService

// After order.save():
await this.eventBus.emit('order.created', {
  orderId: saved._id.toString(),
  userId: saved.userId,
  total: saved.total,
  itemCount: saved.items.length,
});
```

3. **Create an event listener** (`src/order/order.listener.ts`):

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from 'nestjs-boot';

@Injectable()
export class OrderListener {
  private readonly logger = new Logger(OrderListener.name);

  @OnEvent('order.created')
  handleOrderCreated(payload: { orderId: string; userId: string; total: number }) {
    this.logger.log(`New order ${payload.orderId}: $${payload.total} by user ${payload.userId}`);
    // In a real app: send confirmation email, update analytics, etc.
  }
}
```

4. **Register** `OrderListener` in `app.module.ts` providers.

## How to Verify

Create an order and check the server logs -- you should see the listener's log message.

## Solution

Stuck? See [solutions/08-solution/](../solutions/08-solution/)
