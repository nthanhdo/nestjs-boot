# CQRS API Reference

> CQRS + Event Sourcing infrastructure: CommandBus, EventStore, SnapshotStore, EventReplayService, OutboxProcessor, and Saga runner.

## Module Registration

```ts
CqrsModule.register(options: CqrsOptions)
```

Registers globally. Provides `CommandBus`, `EventReplayService`, and the configured stores.

```ts
CqrsModule.register({
  eventStore: 'mongodb',           // 'mongodb' | 'memory'
  snapshotStore: 'mongodb',        // optional
  snapshotFrequency: 100,          // snapshot every N events (default: 100)
  outbox: {
    enabled: true,
    pollInterval: 1000,            // ms (default: 1000)
    maxRetries: 5,                 // before dead-lettering (default: 5)
  },
  connection: 'master',            // DatabaseModule connection name (default: 'default')
})
```

### Options (`CqrsOptions`)

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `eventStore` | `'mongodb' \| 'memory'` | Yes | Event store backend. `memory` = non-persistent (testing only) |
| `snapshotStore` | `'mongodb' \| 'memory'` | No | Snapshot store backend. Omit to disable snapshots |
| `snapshotFrequency` | `number` | No | Take a snapshot every N events per aggregate. Default: `100` |
| `outbox.enabled` | `boolean` | No | Enable Outbox pattern for guaranteed event delivery |
| `outbox.pollInterval` | `number` | No | Outbox poll interval in ms. Default: `1000` |
| `outbox.maxRetries` | `number` | No | Max publish attempts before dead-lettering. Default: `5` |
| `connection` | `string` | No | DatabaseModule connection name to use for MongoDB stores. Default: `'default'` |

---

## Classes

### `AggregateRoot`

Abstract base class for event-sourced aggregates. Accumulates state by applying domain events. Subclass must implement `applyEvent`.

```ts
class Order extends AggregateRoot {
  private status = 'draft';

  static create(id: string, total: number): Order {
    const order = new Order();
    order.apply(new OrderCreatedEvent(id, total));
    return order;
  }

  applyEvent(event: DomainEvent): void {
    if (event instanceof OrderCreatedEvent) this.status = 'created';
  }
}
```

#### Methods

##### `protected apply(event: DomainEvent): void`
Apply a new domain event. Adds the event to the uncommitted list, calls `applyEvent`, and increments `version`.

##### `abstract applyEvent(event: DomainEvent): void`
Implement in subclass as a pure state transition. No side effects.

##### `getUncommittedEvents(): DomainEvent[]`
Returns a copy of all events not yet persisted to the event store.

##### `clearUncommittedEvents(): void`
Clears the uncommitted events list. Called by the repository after persisting.

##### `getVersion(): number`
Returns the current version (number of events applied).

##### `loadFromHistory(events: StoredEvent[]): void`
Rebuilds aggregate state from a sequence of stored events (used when loading from the event store).

##### `loadFromSnapshot(snapshot: { version: number; state: unknown }, events: StoredEvent[]): void`
Rebuilds state from a snapshot and the events that occurred after it.

##### `protected restoreFromSnapshot(state: unknown): void`
Override to restore aggregate state from a snapshot payload. No-op by default.

##### `protected toSnapshot(): unknown`
Override to produce a snapshot of current state. Returns `{}` by default.

---

### `CommandBus`

Routes commands to their registered handlers. Enforces 1:1 routing: one command type → one handler.

```ts
const orderId = await commandBus.execute<string>(
  new CreateOrderCommand('cust-1', [{ sku: 'SKU-A', qty: 2 }]),
);
```

#### Methods

##### `register(commandType: string, handler: ICommandHandler): void`
Register a handler for a command type. Called internally during module init (via `@CommandHandler`). Logs a warning if a handler for the same type already exists.

##### `async execute<T = unknown>(command: ICommand): Promise<T>`
Execute a command by routing to the registered handler. Throws `Error` if no handler is registered for `command.type`.

---

### `DomainEvent` (abstract)

Base class for all domain events in the event sourcing system. Subclass must declare `readonly type: string`.

Auto-populates `correlationId` from the `CorrelationModule` if loaded.

```ts
class OrderCreatedEvent extends DomainEvent {
  readonly type = 'OrderCreated';
  constructor(
    public readonly orderId: string,
    public readonly total: number,
  ) { super(); }
}
```

| Property | Type | Description |
|----------|------|-------------|
| `occurredAt` | `Date` | Timestamp set at construction |
| `correlationId` | `string \| undefined` | Populated from `CorrelationModule` if available |
| `type` | `string` (abstract) | Event type discriminator |

---

### `EventReplayService`

Rebuilds read models by replaying stored events through projection instances decorated with `@Projection` and `@OnDomainEvent`.

```ts
const result = await replayService.replayAll([orderSummaryProjection]);
console.log(`${result.eventsProcessed} events in ${result.durationMs}ms`);
```

#### Methods

##### `async replayAll(projections: object[]): Promise<ReplayResult>`
Replays all events from the event store through the given projection instances.

##### `async replayFrom(position: number, projections: object[]): Promise<ReplayResult>`
Replays events starting from a specific global position.

##### `async replayStream(streamId: string, projections: object[]): Promise<ReplayResult>`
Replays events from a single stream.

#### `ReplayResult`

| Field | Type | Description |
|-------|------|-------------|
| `eventsProcessed` | `number` | Total events processed |
| `durationMs` | `number` | Elapsed time |
| `projectionCounts` | `Record<string, number>` | Events handled per projection |
| `errors` | `{ position: number; type: string; error: string }[]` | Non-fatal errors (replay continues) |

---

### `OutboxProcessor`

Polls the `outbox` MongoDB collection and publishes pending events to the `EventBusService`, guaranteeing at-least-once delivery. Implements `OnModuleInit` / `OnModuleDestroy` to manage the poll interval.

Solves the dual-write problem: state change + outbox write happen in the same transaction; this processor publishes asynchronously.

#### Methods

##### `async processOutbox(): Promise<number>`
Process pending outbox entries. Reads up to 100 unpublished entries, publishes each to `EventBusService`, and marks them published. Returns the count of successfully published entries. Skips if a previous batch is still processing.

##### `async persistToOutbox(type, data, options?): Promise<void>`
Persist an event to the outbox. Call inside the same database transaction as your state change.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `string` | Event type discriminator |
| `data` | `Record<string, unknown>` | Event payload |
| `options.session` | `MongoSession` (optional) | MongoDB session for transactional writes |
| `options.correlationId` | `string` (optional) | Correlation ID |

---

### `SagaBuilder<TContext>`

Fluent builder for constructing saga definitions.

```ts
const createOrderSaga = defineSaga<OrderContext>('create-order')
  .step('reserve-inventory', reserveInventory, compensateInventory)
  .step('charge-payment', chargePayment, refundPayment)
  .step('create-shipment', createShipment, cancelShipment)
  .build();
```

#### Methods

##### `step(name, execute, compensate): SagaBuilder<TContext>`
Add a step with an execute function and a compensating action. Returns `this` for chaining.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Step name (for logging and result reporting) |
| `execute` | `(context: TContext) => Promise<unknown>` | Forward action |
| `compensate` | `(context: TContext, error: Error) => Promise<void>` | Rollback action |

##### `build(): SagaDefinition<TContext>`
Build the immutable saga definition. Throws if no steps have been added.

---

### `SagaRunner`

Executes saga definitions with automatic reverse-order compensation on failure.

```ts
const runner = new SagaRunner();
const result = await runner.execute(createOrderSaga, context);
if (!result.success) {
  console.log('Failed at:', result.failedStep, '— Compensated:', result.compensatedSteps);
}
```

#### Methods

##### `async execute<TContext>(saga, context): Promise<SagaResult>`
Execute all saga steps in order. On failure, compensates completed steps in reverse order.

| Parameter | Type | Description |
|-----------|------|-------------|
| `saga` | `SagaDefinition<TContext>` | Built saga definition |
| `context` | `TContext` | Context object passed to all step functions |

#### `SagaResult`

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether all steps completed |
| `completedSteps` | `string[]` | Names of successfully executed steps |
| `failedStep` | `string \| undefined` | Name of the step that failed |
| `error` | `Error \| undefined` | The error that caused failure |
| `compensatedSteps` | `string[] \| undefined` | Steps that were compensated |

---

### `MemoryEventStore`

In-memory `EventStore` implementation. Data is lost on restart. Fully swappable with `MongoDBEventStore`.

#### Additional method

##### `clear(): void`
Clears all streams and resets the global position counter. Use in tests between test cases.

---

### `MemorySnapshotStore`

In-memory `SnapshotStore` implementation. Stores one snapshot per `streamId`.

#### Additional method

##### `clear(): void`
Clears all snapshots. Use in tests.

---

### `MongoDBEventStore`

MongoDB-backed `EventStore`. Uses a single `event_store` collection with a compound unique index on `{ streamId, version }` for optimistic concurrency. Global ordering via an auto-incrementing counter in `event_store_counters`.

##### Constructor

```ts
new MongoDBEventStore(connection: MongooseConnection)
```

Takes a Mongoose connection from `DatabaseModule`.

---

### `MongoDBSnapshotStore`

MongoDB-backed `SnapshotStore`. Stores one snapshot document per aggregate (upserted on `save`), indexed by `streamId`.

---

## Decorators

### `@CommandHandler(command)`

Marks a class as the handler for a specific command type. Each command type must have exactly one handler.

| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | `Type<ICommand>` | The command class this handler processes |

```ts
@CommandHandler(CreateOrderCommand)
class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  async execute(command: CreateOrderCommand) {
    // ...
    return orderId;
  }
}
```

---

### `@Projection(name)`

Marks a class as an event projection. The `name` parameter uniquely identifies this projection for replay position tracking.

```ts
@Projection('order-summary')
class OrderSummaryProjection {
  @OnDomainEvent(OrderCreatedEvent)
  async onOrderCreated(event: OrderCreatedEvent) { ... }
}
```

---

### `@OnDomainEvent(eventTypeOrString)`

Marks a method within a `@Projection` class as the handler for a specific domain event type.

Accepts either a `DomainEvent` subclass (matched by class name) or a type string (matched against the stored `type` field directly — preferred for event sourcing).

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventTypeOrString` | `Type<DomainEvent> \| string` | Event class or type string |

```ts
@OnDomainEvent('OrderCreated')        // string form — matches stored event type
async handleOrderCreated(event: StoredEvent) { ... }

@OnDomainEvent(OrderCreatedEvent)     // class form — matches by class name
async handleOrderCreated(event: OrderCreatedEvent) { ... }
```

---

## Interfaces

### `EventStore`

| Method | Signature | Description |
|--------|-----------|-------------|
| `append` | `(streamId: string, events: StoredEvent[], expectedVersion?: number) => Promise<void>` | Append events with optional optimistic concurrency check |
| `getEvents` | `(streamId: string, fromVersion?: number) => Promise<StoredEvent[]>` | Read events for one stream |
| `getAllEvents` | `(fromPosition?: number) => Promise<StoredEvent[]>` | Read all events in global position order |

### `SnapshotStore`

| Method | Signature | Description |
|--------|-----------|-------------|
| `save` | `(streamId: string, version: number, state: unknown) => Promise<void>` | Save aggregate state snapshot |
| `load` | `(streamId: string) => Promise<{ version: number; state: unknown } \| null>` | Load latest snapshot or `null` |

### `StoredEvent`

| Field | Type | Description |
|-------|------|-------------|
| `streamId` | `string` | Aggregate/stream identifier |
| `version` | `number` | Per-stream version (1-based, monotonic) |
| `type` | `string` | Event type discriminator |
| `data` | `Record<string, unknown>` | Serialized event payload |
| `metadata.correlationId` | `string \| undefined` | Tracing correlation ID |
| `metadata.causationId` | `string \| undefined` | Causing event/command ID |
| `metadata.timestamp` | `Date` | Event creation time |
| `position` | `number` | Global position across all streams |

### `ICommand`

Marker interface for commands. Must have `readonly type: string`.

### `ICommandHandler<T>`

```ts
interface ICommandHandler<T extends ICommand> {
  execute(command: T): Promise<unknown>;
}
```

### `SagaDefinition<TContext>`

| Field | Type |
|-------|------|
| `name` | `string` |
| `steps` | `ReadonlyArray<SagaStep<TContext>>` |

### `SagaStep<TContext>`

| Field | Type |
|-------|------|
| `name` | `string` |
| `execute` | `(context: TContext) => Promise<unknown>` |
| `compensate` | `(context: TContext, error: Error) => Promise<void>` |

### `OutboxEntry`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Event type discriminator |
| `data` | `Record<string, unknown>` | Serialized payload |
| `correlationId` | `string \| undefined` | Tracing ID |
| `createdAt` | `Date` | When persisted |
| `published` | `boolean` | Whether published to EventBus |
| `retryCount` | `number` | Publish attempt count |
| `lastError` | `string \| undefined` | Last failure message |
| `publishedAt` | `Date \| undefined` | When published |

---

## Functions

### `defineSaga<TContext>(name): SagaBuilder<TContext>`

Entry point for building a saga definition.

```ts
const saga = defineSaga<MyContext>('my-saga')
  .step('step-a', execA, compensateA)
  .build();
```

---

## Constants / Tokens

| Token | Value | Description |
|-------|-------|-------------|
| `CQRS_OPTIONS` | `'CQRS_OPTIONS'` | Injection token for `CqrsOptions` |
| `CQRS_EVENT_STORE` | `'CQRS_EVENT_STORE'` | Injection token for `EventStore` implementation |
| `CQRS_SNAPSHOT_STORE` | `'CQRS_SNAPSHOT_STORE'` | Injection token for `SnapshotStore` implementation |
| `CQRS_COMMAND_BUS` | `'CQRS_COMMAND_BUS'` | Injection token for `CommandBus` |
| `CQRS_REPLAY_SERVICE` | `'CQRS_REPLAY_SERVICE'` | Injection token for `EventReplayService` |
| `CQRS_OUTBOX_PROCESSOR` | `'CQRS_OUTBOX_PROCESSOR'` | Injection token for `OutboxProcessor` |
| `COMMAND_HANDLER_METADATA` | `'CQRS_COMMAND_HANDLER'` | Reflect metadata key for `@CommandHandler` |
| `PROJECTION_METADATA` | `'CQRS_PROJECTION'` | Reflect metadata key for `@Projection` |
| `ON_DOMAIN_EVENT_METADATA` | `'CQRS_ON_DOMAIN_EVENT'` | Reflect metadata key for `@OnDomainEvent` |

---

## Error Classes

### `ConcurrencyError`

Thrown by `EventStore.append()` when `expectedVersion` does not match the current stream version.

```ts
constructor(streamId: string, expectedVersion: number, actualVersion: number)
```

`error.name === 'ConcurrencyError'`. Catch this to implement retry-on-conflict logic.
