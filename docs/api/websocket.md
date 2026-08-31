# WebSocket API Reference

> Production-ready WebSocket scaling with Redis pub/sub, correlation IDs, and metrics — Socket.IO or native `ws`.

## Module Registration

```ts
WebSocketModule.register(options?: WebSocketOptions): DynamicModule
```

Sets up the WebSocket adapter, optional Redis pub/sub, CORS, and namespace auto-registration. The module is global.

```ts
WebSocketModule.register({
  adapter: 'socket.io',                       // 'socket.io' (default) | 'ws'
  redis: { url: 'redis://localhost:6379' },   // opt-in Redis pub/sub
  cors: { origin: 'https://app.example.com' },
  path: '/socket.io',
  namespaces: ['/chat', '/notifications'],
})
```

Optional dependencies (graceful degradation when absent):
- `@socket.io/redis-adapter` + `ioredis` — required for multi-instance Redis pub/sub
- `socket.io` — usually bundled with `@nestjs/platform-socket.io`

When `redis.url` is set but `@socket.io/redis-adapter` is not installed, the module logs a warning and falls back to the default in-memory adapter (single instance only).

## Classes / Methods

### `BootWsGateway`

Abstract base gateway with common production patterns. Extend this instead of implementing the NestJS lifecycle interfaces manually.

```ts
abstract class BootWsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  protected readonly logger: Logger
  protected reflector: Reflector

  // Called by NestJS — do not override directly; use onInit() instead
  afterInit(server: any): void
  handleConnection(client: BootSocket): void
  handleDisconnect(client: BootSocket): void

  // Override these in your subclass as needed
  protected onInit(server: any): void       // called after gateway initializes
  protected onConnect(client: BootSocket): void     // called on client connect
  protected onDisconnect(client: BootSocket): void  // called on client disconnect
}
```

Built-in behaviors on `handleConnection`:
1. Assigns a `correlationId` (UUID) to `client.data.correlationId`.
2. Logs `[WS] connect id=... ns=... correlationId=...`.
3. Auto-joins the room from class-level `@WsRoom` metadata (if `client.join` is available).
4. If the class has `@WsAuthRequired()`, checks `handshake.auth.token` or `handshake.query.token` — disconnects unauthenticated clients (`client.disconnect(true)`).

```ts
@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway extends BootWsGateway {
  @SubscribeMessage('message')
  @WsRoom('lobby')
  handleMessage(@MessageBody() data: any) {
    return data;
  }

  protected override onConnect(client: any) {
    console.log('Custom connect logic for', client.id);
  }
}
```

---

### `WsCorrelationInterceptor`

WebSocket interceptor that injects `correlationId` into every event context and tracks per-namespace connection/message counters.

```ts
@Injectable()
class WsCorrelationInterceptor {
  intercept(context: WsContext, next: { handle(): Observable<unknown> }): Observable<unknown>

  /** Track a new connection (called from BootWsGateway). */
  static trackConnection(namespace: string): void

  /** Track a disconnection (called from BootWsGateway). */
  static untrackConnection(namespace: string): void

  /** Prometheus-style metrics snapshot. */
  static getMetrics(): {
    boot_ws_connections_total: Record<string, number>;
    boot_ws_messages_total: Record<string, number>;
  }
}
```

Logs an error with `correlationId` on stream failure.

---

### `createRedisAdapterFactory`

```ts
function createRedisAdapterFactory(
  options: WebSocketOptions,
): ((io: unknown) => void) | null
```

Creates a `@socket.io/redis-adapter` when `redis.url` is configured. Returns `null` if Redis is not configured or the required packages are not installed (fallback to default in-memory adapter). Sets up separate pub/sub ioredis clients with error/connect event logging.

## Decorators

### `@WsRoom(room)`

```ts
const WsRoom: (room: string) => MethodDecorator & ClassDecorator
```

Declares the room a handler belongs to. `BootWsGateway` uses class-level `@WsRoom` to auto-join clients on connect.

```ts
@WsRoom('chat:lobby')
handleMessage(@MessageBody() data: any) { ... }
```

---

### `@WsBroadcast()`

```ts
const WsBroadcast: () => MethodDecorator
```

Marks a handler to broadcast its return value to all clients in the room. Requires `@WsRoom` on the same method or class.

```ts
@WsBroadcast()
@WsRoom('chat:lobby')
handleMessage(@MessageBody() data: any) { return data; }
```

---

### `@WsAuthRequired()`

```ts
const WsAuthRequired: () => MethodDecorator & ClassDecorator
```

Requires an authenticated WebSocket connection. `BootWsGateway` checks `handshake.auth.token` or `handshake.query.token` on connect and disconnects unauthenticated clients.

```ts
@WsAuthRequired()
handleSecretMessage(@MessageBody() data: any) { ... }
```

---

### `@OnConnection()`

```ts
const OnConnection: () => MethodDecorator
```

Lifecycle hook — marks a method to be called when a client connects. The method receives the connected socket.

```ts
@OnConnection()
onConnect(client: Socket) {
  console.log('Client connected:', client.id);
}
```

---

### `@OnDisconnection()`

```ts
const OnDisconnection: () => MethodDecorator
```

Lifecycle hook — marks a method to be called when a client disconnects.

```ts
@OnDisconnection()
onDisconnect(client: Socket) {
  console.log('Client disconnected:', client.id);
}
```

## Interfaces

### `WebSocketOptions`

```ts
interface WebSocketOptions {
  /** Adapter type. Default: 'socket.io' */
  adapter?: 'socket.io' | 'ws';

  /** Redis config for multi-instance scaling via @socket.io/redis-adapter */
  redis?: WebSocketRedisOptions;

  /** CORS options */
  cors?: WebSocketCorsOptions;

  /** Socket.IO path. Default: '/socket.io' */
  path?: string;

  /** Namespaces to auto-register */
  namespaces?: string[];
}
```

### `WebSocketRedisOptions`

```ts
interface WebSocketRedisOptions {
  url: string;  // Redis URL for multi-instance pub/sub
}
```

### `WebSocketCorsOptions`

```ts
interface WebSocketCorsOptions {
  origin: string | string[];
}
```

## Constants / Tokens

| Token | Value | Description |
|---|---|---|
| `WS_OPTIONS` | `'WS_OPTIONS'` | DI token for the resolved `WebSocketOptions` |
| `WS_REDIS_ADAPTER` | `'WS_REDIS_ADAPTER'` | DI token for the Redis adapter factory function (or null) |
| `WS_ROOM_KEY` | `'ws:room'` | Metadata key for `@WsRoom` |
| `WS_BROADCAST_KEY` | `'ws:broadcast'` | Metadata key for `@WsBroadcast` |
| `WS_AUTH_REQUIRED_KEY` | `'ws:auth-required'` | Metadata key for `@WsAuthRequired` |
| `WS_ON_CONNECTION_KEY` | `'ws:on-connection'` | Metadata key for `@OnConnection` |
| `WS_ON_DISCONNECTION_KEY` | `'ws:on-disconnection'` | Metadata key for `@OnDisconnection` |
