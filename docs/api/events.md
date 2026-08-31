# Events API Reference

> In-process or Redis-backed typed event bus with request/reply (query) support for decoupling modules without circular dependencies.

---

## Module Registration

```ts
import { EventBusModule } from 'nestjs-boot/events';

// In-memory transport (single-process)
EventBusModule.register({ transport: 'memory' })

// Redis transport (cross-service pub/sub)
EventBusModule.register({
  transport: 'redis',
  redis: { url: 'redis://localhost:6379' },
})

// Redis transport — reuse an existing ioredis client pair
EventBusModule.register({
  transport: 'redis',
  redisClient: { publisher: myPublisherClient, subscriber: mySubscriberClient },
})
```

`EventBusModule` is registered as **global**, so `EventBusService` is available everywhere without re-importing the module.

---

## Classes

### `EventBusModule`

Dynamic NestJS module. Discovers and wires all `@OnEvent` and `@OnQuery` handlers automatically during `onModuleInit`.

#### Static Methods

##### `register(options: EventBusOptions): DynamicModule`

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | [`EventBusOptions`](#eventbusoptions) | Transport configuration. |

**Exports:** `EVENT_BUS_SERVICE` token and `EventBusService` class.

---

### `EventBusService`

Core service. Inject via the class token or the `EVENT_BUS_SERVICE` injection token.

```ts
constructor(private readonly eventBus: EventBusService) {}
```

#### Methods

##### `emit(event: BootEvent): Promise<void>`

Emit an event. Local handlers are invoked in the background (fire-and-forget for synchronous handlers). For Redis transport the event is additionally published to the `boot:events` channel.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `BootEvent` | Any instance of a class extending `BootEvent`. |

##### `emitAsync(event: BootEvent): Promise<void>`

Emit an event and **await** all local handlers before resolving. Use when downstream side-effects must be complete before continuing.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `BootEvent` | Any instance of a class extending `BootEvent`. |

##### `emitAndWait<T>(query: BootEvent, options?: EmitAndWaitOptions): Promise<T>`

Emit a query and wait for the registered `@OnQuery` handler to return a result. This is the primary mechanism for getting a return value from another module without creating a circular dependency.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `BootEvent` | An instance of a class extending `BootQuery<T>`. |
| `options` | [`EmitAndWaitOptions`](#emitandwaitoptions) | Optional timeout configuration. |

**Returns:** `Promise<T>` — the value returned by the handler.

**Throws:**
- `Error` if no `@OnQuery` handler is registered for the query class.
- `Error` if the handler does not respond within the timeout (default: 5 000 ms).

```ts
// In OrderService — no import of UserModule needed
const user = await this.eventBus.emitAndWait<User>(
  new GetUserByIdQuery(userId),
  { timeout: 3000 },
);
```

##### `registerHandler(eventClass, handler, options?): void` *(internal)*

Register a handler for an event class. Called automatically by `EventBusModule` — you should not call this directly.

##### `registerQueryHandler(queryClass, handler): void` *(internal)*

Register a query handler. Called automatically by `EventBusModule`. Only one handler per query class is allowed.

---

### `BootEvent` *(abstract)*

Base class for all typed events. Extend this to create domain events.

```ts
class OrderCreatedEvent extends BootEvent {
  constructor(public readonly orderId: string) { super(); }
}
```

| Property | Type | Description |
|----------|------|-------------|
| `timestamp` | `Date` | Automatically set to `new Date()` at construction time. |
| `correlationId` | `string \| undefined` | Propagated from `AsyncLocalStorage` if the correlation module is loaded. |

---

### `BootQuery<TResult>` *(abstract)*

Extends `BootEvent`. Use for events that expect a return value from a handler.

```ts
class GetUserByIdQuery extends BootQuery<User> {
  constructor(public readonly userId: string) { super(); }
}
```

| Type Parameter | Description |
|----------------|-------------|
| `TResult` | The expected return type that `emitAndWait<T>()` will resolve to. |

| Property | Type | Description |
|----------|------|-------------|
| `__isQuery` | `true` | Runtime marker to distinguish queries from plain events. |

---

## Decorators

### `@OnEvent(eventClass, options?)`

Mark a provider method as a handler for the given event class. The method is discovered automatically when `EventBusModule` initialises.

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventClass` | `new (...args) => any` | The event class to subscribe to. |
| `options` | [`OnEventOptions`](#oneventoptions) | Optional handler options. |

```ts
@OnEvent(OrderCreatedEvent)
handleOrderCreated(event: OrderCreatedEvent): void {
  // sync handler
}

@OnEvent(OrderCreatedEvent, { async: true })
async handleOrderCreatedAsync(event: OrderCreatedEvent): Promise<void> {
  // fire-and-forget async handler
}
```

---

### `@OnQuery(queryClass)`

Mark a provider method as the handler for a query (request/reply pattern). Only **one** handler per query class is allowed. The return value is sent back to `emitAndWait()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `queryClass` | `new (...args) => any` | The query class to handle. |

```ts
// In UserModule — no import of OrderModule needed
@OnQuery(GetUserByIdQuery)
async handleGetUser(query: GetUserByIdQuery): Promise<User> {
  return this.userService.findById(query.userId);
}
```

---

## Interfaces

### `EventBusOptions`

```ts
interface EventBusOptions {
  transport: 'memory' | 'redis';
  redis?: {
    url: string; // ioredis-compatible connection URL
  };
  redisClient?: {
    publisher: any;  // Pre-created ioredis publisher client
    subscriber: any; // Pre-created ioredis subscriber client
  };
}
```

When `redisClient` is provided the module reuses it instead of creating its own connections. The module will **not** call `.quit()` on injected clients.

### `OnEventOptions`

```ts
interface OnEventOptions {
  async?: boolean; // When true, handler errors are caught and logged but not awaited by emit()
}
```

### `EmitAndWaitOptions`

```ts
interface EmitAndWaitOptions {
  timeout?: number; // Milliseconds to wait for handler response. Default: 5000
}
```

---

## Constants / Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_BUS_OPTIONS` | `'BOOT_EVENT_BUS_OPTIONS'` | Injection token for the `EventBusOptions` value. |
| `EVENT_BUS_SERVICE` | `'BOOT_EVENT_BUS_SERVICE'` | Injection token for the `EventBusService` instance. |
| `ON_EVENT_METADATA` | `'BOOT_ON_EVENT'` | Reflect metadata key used by `@OnEvent`. |
| `ON_QUERY_METADATA` | `'BOOT_ON_QUERY'` | Reflect metadata key used by `@OnQuery`. |
