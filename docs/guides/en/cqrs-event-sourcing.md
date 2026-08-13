# CQRS and Event Sourcing

nestjs-boot includes a complete CQRS and event sourcing module: a CommandBus for command routing, AggregateRoot for event-sourced aggregates, pluggable EventStore and SnapshotStore backends, an OutboxProcessor for guaranteed delivery, and an EventReplayService for rebuilding read models.

## Setup

Register `CqrsModule` in your BootOptions or as a standalone module:

```ts
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  database: {
    connections: {
      master: { writerUri: 'mongodb://localhost:27017/myapp' },
    },
  },
  cqrs: {
    eventStore: 'mongodb',       // 'mongodb' | 'memory'
    snapshotStore: 'mongodb',    // optional
    snapshotFrequency: 100,      // snapshot every N events per aggregate
    outbox: {
      enabled: true,
      pollInterval: 1000,        // ms between outbox polls
      maxRetries: 5,             // retries before dead-lettering
    },
  },
});

// Or standalone:
CqrsModule.register({ eventStore: 'memory' })
```

The module registers globally. All providers (`CommandBus`, `EventStore`, `EventReplayService`) are available via standard DI.

## CommandBus

Routes commands to their registered handlers with strict 1:1 routing (one command type has exactly one handler).

### Define a Command

Commands are imperative, present-tense, and implement `ICommand`:

```ts
import { ICommand } from 'nestjs-boot/cqrs';

class CreateOrderCommand implements ICommand {
  readonly type = 'CreateOrder';
  constructor(
    public readonly customerId: string,
    public readonly items: { sku: string; qty: number }[],
  ) {}
}
```

### Define a Handler

```ts
import { CommandHandler, ICommandHandler } from 'nestjs-boot/cqrs';

@CommandHandler(CreateOrderCommand)
class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  async execute(command: CreateOrderCommand) {
    const order = Order.create(command.customerId, command.items);
    await this.repository.save(order);
    return order.id;
  }
}
```

### Execute a Command

```ts
import { CommandBus } from 'nestjs-boot/cqrs';

@Injectable()
class OrderController {
  constructor(private readonly commandBus: CommandBus) {}

  async createOrder(dto: CreateOrderDto) {
    return this.commandBus.execute<string>(
      new CreateOrderCommand(dto.customerId, dto.items),
    );
  }
}
```

If no handler is registered for a command type, `execute` throws with a descriptive error.

## AggregateRoot

The DDD building block for event-sourced aggregates. Aggregates accumulate state by applying domain events. Events are collected as "uncommitted" until the repository persists them.

```ts
import { AggregateRoot } from 'nestjs-boot/cqrs';

class Order extends AggregateRoot {
  private status = 'draft';
  private total = 0;

  static create(id: string, total: number): Order {
    const order = new Order();
    order.apply(new OrderCreatedEvent(id, total));
    return order;
  }

  ship(): void {
    if (this.status !== 'confirmed') throw new Error('Cannot ship');
    this.apply(new OrderShippedEvent(this.id));
  }

  // Pure state transition -- no side effects
  applyEvent(event: DomainEvent): void {
    if (event instanceof OrderCreatedEvent) {
      this.status = 'created';
      this.total = event.total;
    } else if (event instanceof OrderShippedEvent) {
      this.status = 'shipped';
    }
  }
}
```

Key methods:
- `apply(event)` -- adds to uncommitted list, calls `applyEvent`, increments version
- `getUncommittedEvents()` -- returns events not yet persisted
- `clearUncommittedEvents()` -- call after persisting to event store
- `getVersion()` -- current version (number of events applied)
- `loadFromHistory(events)` -- rebuild from stored events
- `loadFromSnapshot(snapshot, events)` -- rebuild from snapshot + remaining events

### Snapshots

Override `toSnapshot()` and `restoreFromSnapshot(state)` to support snapshot-based loading:

```ts
class Order extends AggregateRoot {
  protected toSnapshot() {
    return { status: this.status, total: this.total };
  }

  protected restoreFromSnapshot(state: any) {
    this.status = state.status;
    this.total = state.total;
  }
}
```

## DomainEvent

Base class for all domain events. Events are immutable, past-tense records of state changes. Each event automatically captures `occurredAt` timestamp and `correlationId` (from AsyncLocalStorage if the correlation module is loaded).

```ts
import { DomainEvent } from 'nestjs-boot/cqrs';

class OrderCreatedEvent extends DomainEvent {
  readonly type = 'OrderCreated';
  constructor(
    public readonly orderId: string,
    public readonly total: number,
  ) { super(); }
}
```

The `StoredEvent` interface adds persistence context: `streamId`, `version` (per-stream, 1-based), `type`, `data`, `metadata` (correlationId, causationId, timestamp), and `position` (global, for ordered replay).

## EventStore

The persistence layer for domain events. Two built-in implementations:

| Backend | Use case |
|---------|----------|
| `MemoryEventStore` | Testing and development. Data is lost on restart. |
| `MongoDBEventStore` | Production. Uses the DatabaseModule connection. |

The interface defines three methods:

```ts
interface EventStore {
  append(streamId: string, events: StoredEvent[], expectedVersion?: number): Promise<void>;
  getEvents(streamId: string, fromVersion?: number): Promise<StoredEvent[]>;
  getAllEvents(fromPosition?: number): Promise<StoredEvent[]>;
}
```

`append` supports optimistic concurrency: when `expectedVersion` is provided and does not match the stream's current version, a `ConcurrencyError` is thrown.

## SnapshotStore

Optional optimization to avoid replaying the full event history for long-lived aggregates. Two backends: `MemorySnapshotStore` (testing) and `MongoDBSnapshotStore` (production).

```ts
interface SnapshotStore {
  save(streamId: string, version: number, state: unknown): Promise<void>;
  load(streamId: string): Promise<{ version: number; state: unknown } | null>;
}
```

Configure `snapshotFrequency` (default 100) in CqrsOptions to control how often snapshots are taken.

## OutboxProcessor

Solves the dual-write problem with at-least-once guaranteed event delivery using the Outbox Pattern.

The flow:
1. Your command handler saves state change + event to the **same database transaction**
2. `OutboxProcessor` polls the `outbox` collection and publishes pending events to the EventBus
3. Even if the process crashes after step 1, events are published on restart

```ts
// In your command handler -- save to outbox in the same transaction:
async execute(command: CreateOrderCommand) {
  const session = await this.connection.startSession();
  session.startTransaction();
  try {
    await this.orderCollection.insertOne(order, { session });
    await this.outboxProcessor.persistToOutbox(
      'OrderCreated',
      { orderId: order.id, total: order.total },
      { session, correlationId: '...' },
    );
    await session.commitTransaction();
  } finally {
    session.endSession();
  }
}
```

The processor polls every `pollInterval` ms (default 1000), processes up to 100 entries per batch, and retries failed entries up to `maxRetries` (default 5) before dead-lettering them. The `outbox` collection is automatically indexed on `{ published: 1, createdAt: 1 }`.

## EventReplayService

Rebuilds read models by replaying stored events through projection instances.

```ts
import { EventReplayService } from 'nestjs-boot/cqrs';

const result = await replayService.replayAll([orderSummaryProjection]);
console.log(result);
// {
//   eventsProcessed: 15000,
//   durationMs: 1234,
//   projectionCounts: { OrderSummaryProjection: 12000 },
//   errors: [],
// }
```

Three replay methods:
- `replayAll(projections)` -- replay all events across all streams
- `replayFrom(position, projections)` -- replay from a global position
- `replayStream(streamId, projections)` -- replay a single stream

Replay is fault-tolerant: errors on individual events are logged and collected in the result, but replay continues.

## Decorators

### @CommandHandler(CommandClass)

Marks a class as the handler for a specific command type. Registered during module initialization.

### @Projection(name)

Marks a class as an event projection for building read models:

```ts
@Projection('order-summary')
class OrderSummaryProjection {
  @OnDomainEvent('OrderCreated')
  async onOrderCreated(event: StoredEvent) {
    await this.db.collection('order_summaries').insertOne({
      orderId: event.data.orderId,
      status: 'created',
    });
  }

  @OnDomainEvent('OrderShipped')
  async onOrderShipped(event: StoredEvent) {
    await this.db.collection('order_summaries').updateOne(
      { orderId: event.data.orderId },
      { $set: { status: 'shipped' } },
    );
  }
}
```

### @OnDomainEvent(typeOrClass)

Marks a method as a handler for a specific domain event type within a projection. Accepts a DomainEvent subclass or a type string. When using event sourcing, prefer the string form since stored events use the `type` field (e.g., `'OrderCreated'`), not the class name.

## Best Practices

- Keep `applyEvent` as a pure state transition with no side effects (no I/O, no throwing)
- Use `ConcurrencyError` handling in your repository to implement retry-on-conflict
- Start with `MemoryEventStore` for development, switch to `MongoDBEventStore` for production
- Name events in past tense (`OrderCreated`, not `CreateOrder`) to distinguish from commands
- Use the outbox pattern whenever you need to publish events reliably after a state change
- Set `snapshotFrequency` based on your aggregate's event volume; 100 is a reasonable default
- Build projections as separate, independently replayable read models
- Use `replayAll` to backfill new projections after deploying them

## See also

- [Event Bus](events.md) — simpler pub/sub for in-process communication (no persistence)
- [Database](database.md) — `UnitOfWork` for MongoDB transactions used with the outbox pattern
