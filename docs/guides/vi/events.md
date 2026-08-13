# Event Bus

nestjs-boot cung cấp event bus trong tiến trình (hoặc phân tán qua Redis) cho các mẫu publish/subscribe và request/reply có kiểu. Khác với hệ thống DomainEvent của CQRS (dùng cho event sourcing và lưu trữ), EventBus dùng cho giao tiếp real-time trong tiến trình và phá vỡ phụ thuộc vòng giữa các module.

## Cài đặt

```ts
import { BootModule } from '@nestjs-boot/core';

// Trong bộ nhớ (đơn tiến trình)
BootModule.register({
  events: { transport: 'memory' },
});

// Redis (liên service)
BootModule.register({
  events: {
    transport: 'redis',
    redis: { url: 'redis://localhost:6379' },
  },
});
```

Hoặc độc lập:

```ts
import { EventBusModule } from '@nestjs-boot/events';

EventBusModule.register({ transport: 'memory' })
```

Module đăng ký toàn cục. `EventBusService` khả dụng qua DI tiêu chuẩn.

Bạn cũng có thể inject Redis client đã tạo sẵn (ví dụ chia sẻ từ CacheModule) qua `redisClient: { publisher, subscriber }` để tránh tạo kết nối trùng lặp.

## BootEvent

Lớp cơ sở cho tất cả event có kiểu. Tự động ghi nhận `timestamp` và `correlationId` (từ AsyncLocalStorage nếu module correlation đã được nạp).

```ts
import { BootEvent } from '@nestjs-boot/events';

class OrderCreatedEvent extends BootEvent {
  constructor(
    public readonly orderId: string,
    public readonly total: number,
  ) { super(); }
}
```

## Phát sự kiện

`EventBusService` cung cấp ba phương thức phát:

```ts
import { EventBusService } from '@nestjs-boot/events';

@Injectable()
class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async createOrder(dto: CreateOrderDto) {
    const order = await this.save(dto);

    // Bắn và quên -- handler chạy nền
    await this.eventBus.emit(new OrderCreatedEvent(order.id, order.total));

    // Chờ TẤT CẢ handler hoàn thành
    await this.eventBus.emitAsync(new OrderCreatedEvent(order.id, order.total));

    return order;
  }
}
```

| Phương thức | Hành vi |
|--------|----------|
| `emit(event)` | Kích hoạt handler chạy nền. Lỗi từ handler bất đồng bộ được ghi log nhưng không lan truyền. |
| `emitAsync(event)` | Chờ tất cả handler qua `Promise.all`. Lỗi lan truyền đến người gọi. |

Với Redis transport, cả hai phương thức đều publish lên kênh `boot:events` ngoài việc gọi handler cục bộ, cho phép phân phối event liên service.

## Decorator @OnEvent

Đánh dấu một phương thức là handler cho lớp event cụ thể:

```ts
import { OnEvent } from '@nestjs-boot/events';

@Injectable()
class NotificationService {
  @OnEvent(OrderCreatedEvent)
  handleOrderCreated(event: OrderCreatedEvent) {
    console.log(`Order ${event.orderId} created for $${event.total}`);
  }

  @OnEvent(OrderCreatedEvent, { async: true })
  async sendEmail(event: OrderCreatedEvent) {
    // Chạy bắn-và-quên ngay cả với emitAsync
    await this.mailer.send(event.orderId);
  }
}
```

Tùy chọn `async: true` đánh dấu handler là bắn-và-quên: lỗi được ghi log nhưng không bao giờ chặn bên phát, ngay cả khi dùng `emitAsync`.

Nhiều handler có thể subscribe cùng một lớp event (fan-out).

## BootQuery và Request/Reply

`BootQuery<TResult>` mở rộng `BootEvent` cho trường hợp cần giá trị trả về. Đây là cơ chế chính để phá vỡ phụ thuộc vòng giữa các module.

### Định nghĩa Query

```ts
import { BootQuery } from '@nestjs-boot/events';

class GetUserByIdQuery extends BootQuery<User> {
  constructor(public readonly userId: string) { super(); }
}
```

### Xử lý Query

```ts
import { OnQuery } from '@nestjs-boot/events';

@Injectable()
class UserQueryHandler {
  constructor(private readonly userService: UserService) {}

  @OnQuery(GetUserByIdQuery)
  async handle(query: GetUserByIdQuery): Promise<User> {
    return this.userService.findById(query.userId);
  }
}
```

Chỉ được phép **một** handler cho mỗi lớp query. Nếu đăng ký handler thứ hai, handler đầu tiên bị ghi đè kèm cảnh báo.

### Phát và chờ

```ts
const user = await this.eventBus.emitAndWait<User>(
  new GetUserByIdQuery(userId),
  { timeout: 5000 },  // mặc định: 5000ms
);
```

`emitAndWait` ném lỗi nếu không có handler nào được đăng ký hoặc handler không phản hồi trong thời gian timeout.

## Phá vỡ phụ thuộc vòng

Event bus là giải pháp được khuyến nghị khi Module A cần dữ liệu từ Module B, nhưng Module B đã import Module A.

**Trước** (phụ thuộc vòng):

```ts
// order.service.ts -- import UserService trực tiếp
@Injectable()
class OrderService {
  constructor(private readonly userService: UserService) {} // vòng!
}
```

**Sau** (event bus query):

```ts
// order.service.ts -- không import UserModule
@Injectable()
class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async createOrder(dto: CreateOrderDto) {
    const user = await this.eventBus.emitAndWait<User>(
      new GetUserByIdQuery(dto.userId),
    );
    // dùng user...
  }
}

// user-query.handler.ts -- trong UserModule
@Injectable()
class UserQueryHandler {
  constructor(private readonly userService: UserService) {}

  @OnQuery(GetUserByIdQuery)
  handle(query: GetUserByIdQuery) {
    return this.userService.findById(query.userId);
  }
}
```

Lớp query (`GetUserByIdQuery`) nằm trong module chia sẻ hoặc thư mục `contracts/` riêng được import bởi cả hai phía. Không module nào import module kia.

## So sánh Transport

| Tính năng | Memory | Redis |
|---------|--------|-------|
| Liên service | Không | Có |
| Độ trễ | Micro giây | Round-trip mạng |
| Lưu trữ | Không | Không (pub/sub là bắn-và-quên) |
| Phụ thuộc | Không | `ioredis` |
| `emitAndWait` | Có | Chỉ handler cục bộ |

Nếu `ioredis` chưa được cài khi dùng Redis transport, service ghi cảnh báo và fallback sang memory transport.

## Thực hành tốt

- Dùng `emit` (bắn-và-quên) cho tác dụng phụ không cần chặn người gọi (thông báo, analytics)
- Dùng `emitAsync` khi cần đảm bảo tất cả handler hoàn thành trước khi phản hồi (vô hiệu hóa cache, ghi audit log)
- Dùng `emitAndWait` (query) để phá vỡ phụ thuộc vòng thay vì `forwardRef`
- Giữ handler query nhanh; đặt timeout phù hợp cho thao tác chậm
- Định nghĩa lớp event và query trong module contracts chia sẻ để tránh coupling
- Ưu tiên memory transport cho ứng dụng đơn tiến trình; chỉ dùng Redis khi cần phân phối liên service
