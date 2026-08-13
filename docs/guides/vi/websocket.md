# WebSocket

`WebSocketModule` cung cấp hỗ trợ WebSocket sẵn sàng cho production với Socket.IO, pub/sub Redis tùy chọn để mở rộng đa instance, quản lý room, auth guard, và theo dõi correlation.

## Cài đặt

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

## Tham chiếu cấu hình

```ts
interface WebSocketOptions {
  adapter?: 'socket.io' | 'ws';       // mặc định: 'socket.io'
  redis?: { url: string };            // bật pub/sub đa instance
  cors?: { origin: string | string[] };
  path?: string;                       // mặc định: '/socket.io'
  namespaces?: string[];               // namespace được đăng ký tự động
}
```

## Redis Adapter

Khi `redis.url` được đặt, module tạo `@socket.io/redis-adapter` với client pub/sub ioredis. Điều này cho phép broadcast qua nhiều instance NestJS. Tự động quay về in-memory nếu `@socket.io/redis-adapter` hoặc `ioredis` chưa được cài đặt.

Cài đặt dependency tùy chọn: `npm install @socket.io/redis-adapter ioredis`

## Lớp cơ sở BootWsGateway

Kế thừa `BootWsGateway` để có các pattern production sẵn dùng:

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

`BootWsGateway` tự động:
- Log kết nối/ngắt kết nối với `correlationId`.
- Tự động join client vào room được khai báo bằng `@WsRoom` ở cấp class.
- Từ chối client chưa xác thực khi `@WsAuthRequired` được đặt (kiểm tra `handshake.auth.token` hoặc `handshake.query.token`).
- Theo dõi số lượng kết nối theo namespace qua `WsCorrelationInterceptor`.

## Decorator

### @WsRoom(room)

Khai báo room mà handler hoặc gateway thuộc về. Client được tự động join khi kết nối nếu đặt ở cấp class.

```ts
@WsRoom('chat:lobby')
handleMessage(@MessageBody() data: any) { return data; }
```

### @WsBroadcast()

Đánh dấu handler để broadcast giá trị trả về tới tất cả client trong room (yêu cầu `@WsRoom`).

### @WsAuthRequired()

Yêu cầu kết nối WebSocket đã xác thực. Client không có `token` trong `handshake.auth` hoặc `handshake.query` sẽ bị ngắt kết nối ngay lập tức.

### @OnConnection() / @OnDisconnection()

Hook vòng đời được gọi khi client kết nối hoặc ngắt kết nối:

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

## Hook vòng đời (Override)

`BootWsGateway` cung cấp các phương thức protected bạn có thể override thay vì dùng decorator:

```ts
protected onInit(server: any): void {}
protected onConnect(client: BootSocket): void {}
protected onDisconnect(client: BootSocket): void {}
```

## WsCorrelationInterceptor

Được inject global bởi module. Với mỗi message WebSocket, nó:

1. Tạo `correlationId` (UUID v4) để truy vết.
2. Tăng bộ đếm message theo namespace.
3. Log lỗi kèm correlation ID.

Truy cập metric theo chương trình:

```ts
const metrics = WsCorrelationInterceptor.getMetrics();
// { boot_ws_connections_total: { '/chat': 5 }, boot_ws_messages_total: { '/chat': 142 } }
```

## Luồng xác thực

1. Client kết nối với token: `io('wss://api.example.com/chat', { auth: { token: 'jwt...' } })`.
2. `BootWsGateway.handleConnection` kiểm tra metadata `@WsAuthRequired`.
3. Nếu yêu cầu và không có token, client bị ngắt kết nối cưỡng bức.
4. Để xác thực JWT tùy chỉnh, override `onConnect` và xác minh token ở đó.

## Thực hành tốt nhất

- Luôn cấu hình Redis adapter trong production để mở rộng theo chiều ngang.
- Sử dụng namespace (`/chat`, `/notifications`) để cách ly mối quan tâm.
- Override `onConnect` để xác thực JWT claim thay vì chỉ kiểm tra sự hiện diện của token.
- Theo dõi `WsCorrelationInterceptor.getMetrics()` để biết khối lượng kết nối/message.
- Giữ tên room có tính xác định (ví dụ: `order:{orderId}`) để broadcast có mục tiêu.
