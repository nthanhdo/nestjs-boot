# WebSocket

`WebSocketModule` provides production-ready WebSocket support with Socket.IO, optional Redis pub/sub for multi-instance scaling, room management, auth guards, and correlation tracking.

## Setup

```ts
import { WebSocketModule } from 'nestjs-boot/websocket';

@Module({
  imports: [
    WebSocketModule.register({
      adapter: 'socket.io',
      redis: { url: 'redis://localhost:6379' },
      cors: { origin: 'https://app.example.com' },
      path: '/socket.io',
      namespaces: ['/chat', '/notifications'],
    }),
  ],
})
export class AppModule {}
```

## Configuration Reference

```ts
interface WebSocketOptions {
  adapter?: 'socket.io' | 'ws';       // default: 'socket.io'
  redis?: { url: string };            // enable multi-instance pub/sub
  cors?: { origin: string | string[] };
  path?: string;                       // default: '/socket.io'
  namespaces?: string[];               // auto-registered namespaces
}
```

## Redis Adapter

When `redis.url` is set, the module creates a `@socket.io/redis-adapter` with ioredis pub/sub clients. This enables broadcasting across multiple NestJS instances. Falls back to in-memory if `@socket.io/redis-adapter` or `ioredis` are not installed.

Install optional deps: `npm install @socket.io/redis-adapter ioredis`

## BootWsGateway Base Class

Extend `BootWsGateway` for production patterns out of the box:

```ts
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { BootWsGateway, WsRoom, WsBroadcast, WsAuthRequired } from 'nestjs-boot/websocket';

@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway extends BootWsGateway {
  @SubscribeMessage('message')
  @WsRoom('lobby')
  @WsBroadcast()
  handleMessage(@MessageBody() data: { text: string }) {
    return { sender: 'server', text: data.text };
  }
}
```

`BootWsGateway` automatically:
- Logs connections/disconnections with a `correlationId`.
- Auto-joins clients to rooms declared with `@WsRoom` at the class level.
- Rejects unauthenticated clients when `@WsAuthRequired` is set (checks `handshake.auth.token` or `handshake.query.token`).
- Tracks connection counts per namespace via `WsCorrelationInterceptor`.

## Decorators

### @WsRoom(room)

Declares the room a handler or gateway belongs to. Clients are auto-joined on connect when set at the class level.

```ts
@WsRoom('chat:lobby')
handleMessage(@MessageBody() data: any) { return data; }
```

### @WsBroadcast()

Marks a handler to broadcast its return value to all clients in the room (requires `@WsRoom`).

### @WsAuthRequired()

Requires an authenticated WebSocket connection. Clients without a `token` in `handshake.auth` or `handshake.query` are disconnected immediately.

### @OnConnection() / @OnDisconnection()

Lifecycle hooks called when clients connect or disconnect:

```ts
@OnConnection()
onConnect(client: Socket) {
  console.log('Connected:', client.id);
}

@OnDisconnection()
onDisconnect(client: Socket) {
  console.log('Disconnected:', client.id);
}
```

## Lifecycle Hooks (Override)

`BootWsGateway` exposes protected methods you can override instead of using decorators:

```ts
protected onInit(server: any): void {}
protected onConnect(client: BootSocket): void {}
protected onDisconnect(client: BootSocket): void {}
```

## WsCorrelationInterceptor

Injected globally by the module. For every WebSocket message it:

1. Generates a `correlationId` (UUID v4) for tracing.
2. Increments per-namespace message counters.
3. Logs errors with the correlation ID.

Access metrics programmatically:

```ts
const metrics = WsCorrelationInterceptor.getMetrics();
// { boot_ws_connections_total: { '/chat': 5 }, boot_ws_messages_total: { '/chat': 142 } }
```

## Authentication Flow

1. Client connects with a token: `io('wss://api.example.com/chat', { auth: { token: 'jwt...' } })`.
2. `BootWsGateway.handleConnection` checks for `@WsAuthRequired` metadata.
3. If required and no token is present, the client is disconnected with force.
4. For custom JWT validation, override `onConnect` and verify the token there.

## Best Practices

- Always configure Redis adapter in production for horizontal scaling.
- Use namespaces (`/chat`, `/notifications`) to isolate concerns.
- Override `onConnect` to validate JWT claims rather than just checking token presence.
- Monitor `WsCorrelationInterceptor.getMetrics()` for connection/message volume.
- Keep room names deterministic (e.g., `order:{orderId}`) for targeted broadcasts.

## Common Pitfalls

- **Missing Redis adapter in multi-instance** — Without `@socket.io/redis-adapter`, broadcasts only reach clients connected to the same instance. Install the adapter for any deployment with more than one pod.
- **`@WsAuthRequired` only checks token presence** — It does not verify the JWT. Override `onConnect` to call `jwt.verify()` for real authentication.
- **CORS not configured** — Socket.IO requires explicit CORS origin. Without `cors.origin`, browser clients receive opaque connection failures.
