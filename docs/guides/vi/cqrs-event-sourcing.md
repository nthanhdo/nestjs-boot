# CQRS và Event Sourcing

nestjs-boot bao gồm module CQRS và event sourcing hoàn chỉnh: CommandBus để định tuyến command, AggregateRoot cho aggregate theo event sourcing, EventStore và SnapshotStore backend có thể thay thế, OutboxProcessor đảm bảo gửi sự kiện, và EventReplayService để xây dựng lại read model.

## Cài đặt

Đăng ký `CqrsModule` trong BootOptions hoặc như module độc lập:

```ts
import { BootModule } from '@nestjs-boot/core';

BootModule.register({
  database: { uri: 'mongodb://localhost/myapp' },
  cqrs: {
    eventStore: 'mongodb',       // 'mongodb' | 'memory'
    snapshotStore: 'mongodb',    // tùy chọn
    snapshotFrequency: 100,      // snapshot mỗi N event trên mỗi aggregate
    outbox: {
      enabled: true,
      pollInterval: 1000,        // ms giữa các lần poll outbox
      maxRetries: 5,             // số lần thử lại trước khi chuyển sang dead-letter
    },
  },
});

// Hoặc độc lập:
CqrsModule.register({ eventStore: 'memory' })
```

Module đăng ký toàn cục. Tất cả provider (`CommandBus`, `EventStore`, `EventReplayService`) khả dụng qua DI tiêu chuẩn.

## CommandBus

Định tuyến command đến handler đã đăng ký với ràng buộc 1:1 nghiêm ngặt (mỗi loại command có đúng một handler).

### Định nghĩa Command

Command mang tính mệnh lệnh, thì hiện tại, và implement `ICommand`:

```ts
import { ICommand } from '@nestjs-boot/cqrs';

class CreateOrderCommand implements ICommand {
  readonly type = 'CreateOrder';
  constructor(
    public readonly customerId: string,
    public readonly items: { sku: string; qty: number }[],
  ) {}
}
```

### Định nghĩa Handler

```ts
import { CommandHandler, ICommandHandler } from '@nestjs-boot/cqrs';

@CommandHandler(CreateOrderCommand)
class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  async execute(command: CreateOrderCommand) {
    const order = Order.create(command.customerId, command.items);
    await this.repository.save(order);
    return order.id;
  }
}
```

### Thực thi Command

```ts
import { CommandBus } from '@nestjs-boot/cqrs';

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

Nếu không có handler nào được đăng ký cho loại command đó, `execute` sẽ ném lỗi với mô tả rõ ràng.

## AggregateRoot

Khối xây dựng DDD cho aggregate theo event sourcing. Aggregate tích lũy trạng thái bằng cách áp dụng domain event. Các event được thu thập dưới dạng "chưa commit" cho đến khi repository lưu trữ chúng.

```ts
import { AggregateRoot } from '@nestjs-boot/cqrs';

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

  // Chuyển đổi trạng thái thuần túy -- không có tác dụng phụ
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

Các phương thức chính:
- `apply(event)` -- thêm vào danh sách chưa commit, gọi `applyEvent`, tăng version
- `getUncommittedEvents()` -- trả về các event chưa được lưu trữ
- `clearUncommittedEvents()` -- gọi sau khi đã lưu vào event store
- `getVersion()` -- version hiện tại (số event đã áp dụng)
- `loadFromHistory(events)` -- xây dựng lại từ event đã lưu
- `loadFromSnapshot(snapshot, events)` -- xây dựng lại từ snapshot + các event còn lại

### Snapshot

Ghi đè `toSnapshot()` và `restoreFromSnapshot(state)` để hỗ trợ tải từ snapshot:

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

Lớp cơ sở cho tất cả domain event. Event là bản ghi bất biến, thì quá khứ, ghi nhận sự thay đổi trạng thái. Mỗi event tự động ghi nhận timestamp `occurredAt` và `correlationId` (từ AsyncLocalStorage nếu module correlation đã được nạp).

```ts
import { DomainEvent } from '@nestjs-boot/cqrs';

class OrderCreatedEvent extends DomainEvent {
  readonly type = 'OrderCreated';
  constructor(
    public readonly orderId: string,
    public readonly total: number,
  ) { super(); }
}
```

Interface `StoredEvent` bổ sung ngữ cảnh lưu trữ: `streamId`, `version` (theo stream, bắt đầu từ 1), `type`, `data`, `metadata` (correlationId, causationId, timestamp), và `position` (toàn cục, phục vụ replay có thứ tự).

## EventStore

Tầng lưu trữ cho domain event. Hai implementation có sẵn:

| Backend | Trường hợp sử dụng |
|---------|----------|
| `MemoryEventStore` | Test và phát triển. Dữ liệu mất khi khởi động lại. |
| `MongoDBEventStore` | Production. Sử dụng kết nối từ DatabaseModule. |

Interface định nghĩa ba phương thức:

```ts
interface EventStore {
  append(streamId: string, events: StoredEvent[], expectedVersion?: number): Promise<void>;
  getEvents(streamId: string, fromVersion?: number): Promise<StoredEvent[]>;
  getAllEvents(fromPosition?: number): Promise<StoredEvent[]>;
}
```

`append` hỗ trợ kiểm soát đồng thời lạc quan: khi cung cấp `expectedVersion` mà không khớp với version hiện tại của stream, `ConcurrencyError` sẽ được ném.

## SnapshotStore

Tối ưu hóa tùy chọn để tránh replay toàn bộ lịch sử event cho aggregate tồn tại lâu dài. Hai backend: `MemorySnapshotStore` (test) và `MongoDBSnapshotStore` (production).

```ts
interface SnapshotStore {
  save(streamId: string, version: number, state: unknown): Promise<void>;
  load(streamId: string): Promise<{ version: number; state: unknown } | null>;
}
```

Cấu hình `snapshotFrequency` (mặc định 100) trong CqrsOptions để kiểm soát tần suất tạo snapshot.

## OutboxProcessor

Giải quyết bài toán dual-write với cơ chế gửi event đảm bảo ít nhất một lần (at-least-once) sử dụng Outbox Pattern.

Luồng xử lý:
1. Command handler lưu thay đổi trạng thái + event vào **cùng một database transaction**
2. `OutboxProcessor` poll collection `outbox` và publish các event đang chờ lên EventBus
3. Ngay cả khi tiến trình crash sau bước 1, event vẫn được publish khi khởi động lại

```ts
// Trong command handler -- lưu vào outbox trong cùng transaction:
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

Processor poll mỗi `pollInterval` ms (mặc định 1000), xử lý tối đa 100 entry mỗi batch, và thử lại entry thất bại tối đa `maxRetries` lần (mặc định 5) trước khi chuyển sang dead-letter. Collection `outbox` được tự động đánh index trên `{ published: 1, createdAt: 1 }`.

## EventReplayService

Xây dựng lại read model bằng cách replay event đã lưu qua các projection instance.

```ts
import { EventReplayService } from '@nestjs-boot/cqrs';

const result = await replayService.replayAll([orderSummaryProjection]);
console.log(result);
// {
//   eventsProcessed: 15000,
//   durationMs: 1234,
//   projectionCounts: { OrderSummaryProjection: 12000 },
//   errors: [],
// }
```

Ba phương thức replay:
- `replayAll(projections)` -- replay tất cả event trên mọi stream
- `replayFrom(position, projections)` -- replay từ một vị trí toàn cục
- `replayStream(streamId, projections)` -- replay một stream duy nhất

Replay có khả năng chịu lỗi: lỗi trên từng event được ghi log và thu thập trong kết quả, nhưng replay vẫn tiếp tục.

## Decorator

### @CommandHandler(CommandClass)

Đánh dấu một lớp là handler cho loại command cụ thể. Được đăng ký trong quá trình khởi tạo module.

### @Projection(name)

Đánh dấu một lớp là event projection phục vụ xây dựng read model:

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

Đánh dấu một phương thức là handler cho loại domain event cụ thể trong một projection. Chấp nhận lớp con DomainEvent hoặc chuỗi type. Khi sử dụng event sourcing, ưu tiên dạng chuỗi vì stored event dùng trường `type` (ví dụ `'OrderCreated'`), không phải tên lớp.

## Thực hành tốt

- Giữ `applyEvent` là chuyển đổi trạng thái thuần túy, không có tác dụng phụ (không I/O, không ném lỗi)
- Dùng xử lý `ConcurrencyError` trong repository để thực hiện thử lại khi xung đột
- Bắt đầu với `MemoryEventStore` cho phát triển, chuyển sang `MongoDBEventStore` cho production
- Đặt tên event ở thì quá khứ (`OrderCreated`, không phải `CreateOrder`) để phân biệt với command
- Sử dụng outbox pattern khi cần publish event đáng tin cậy sau thay đổi trạng thái
- Đặt `snapshotFrequency` dựa trên lượng event của aggregate; 100 là giá trị hợp lý mặc định
- Xây dựng projection như các read model riêng biệt, có thể replay độc lập
- Dùng `replayAll` để bổ sung dữ liệu cho projection mới sau khi triển khai
