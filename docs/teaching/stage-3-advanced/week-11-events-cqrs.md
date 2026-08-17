# Tuần 11: Event-Driven Architecture & CQRS

> **Stage 3 — Advanced | nestjs-boot Teaching Series**
> Yêu cầu: Đã học Tuần 9-10, hiểu cơ bản về async processing

---

## Mục tiêu học tập

Sau bài này, sinh viên có thể:
- Phân biệt Event, Command, Query và biết khi nào dùng cái nào
- Implement EventBus với `@OnEvent` decorator trong nestjs-boot
- Giải thích CQRS và tại sao tách read/write model lại có lợi
- Hiểu Event Sourcing — lưu events thay vì state
- Implement Saga pattern để xử lý distributed transactions
- Tránh dual-write problem bằng Outbox pattern

---

## 1. Events vs Commands vs Queries — Analogy đơn giản

### 1.1 Ba loại "tin nhắn" trong hệ thống

```
NEWSPAPER HEADLINE (Event — Sự kiện):
"BREAKING: OrderCreated — Order #123 was placed by User Alice at 14:32"

→ Thông báo việc đã xảy ra
→ Không yêu cầu ai phải làm gì
→ Ai muốn biết thì subscribe, không ai subscribe cũng được
→ Không thể bị từ chối (đã xảy ra rồi)
→ Tên ở thì QUÁ KHỨ: OrderCreated, PaymentProcessed, UserRegistered
```

```
ORDER TO WAITER (Command — Lệnh):
"Tôi muốn 1 ly cà phê sữa, không đường"

→ Yêu cầu hệ thống làm điều gì đó
→ Có thể bị từ chối (hết cà phê, kitchen đóng cửa)
→ Chính xác 1 người/service xử lý
→ Tên ở THÌ HIỆN TẠI CHỈ HƯỚNG: CreateOrder, ProcessPayment, RegisterUser
```

```
QUESTION (Query — Truy vấn):
"Đơn hàng #123 của tôi đang ở đâu?"

→ Hỏi thông tin, không thay đổi state
→ Luôn được trả lời
→ Có thể read từ bất kỳ đâu (cache, read replica, etc.)
→ Tên dạng câu hỏi: GetOrder, FindUserByEmail, ListOrders
```

### 1.2 Tóm tắt

| | Event | Command | Query |
|--|-------|---------|-------|
| **Tên** | Quá khứ | Hiện tại/chỉ hướng | Câu hỏi |
| **Ví dụ** | `OrderCreated` | `CreateOrder` | `GetOrder` |
| **Ai xử lý** | 0 → N handlers | Đúng 1 handler | Đúng 1 handler |
| **Có thể fail** | Không (đã xảy ra) | Có (business rules) | Có (not found) |
| **Thay đổi state** | Ghi nhận thay đổi | Tạo ra thay đổi | Không |
| **Return value** | Không | Có thể | Bắt buộc |

---

## 2. Event-Driven Architecture (EDA)

### 2.1 Tại sao EDA?

**Vấn đề với direct coupling:**

```typescript
// Tạo order → tự gọi tất cả services liên quan
class OrderService {
  constructor(
    private inventoryService: InventoryService,     // Phụ thuộc trực tiếp
    private emailService: EmailService,              // Phụ thuộc trực tiếp
    private loyaltyService: LoyaltyService,          // Phụ thuộc trực tiếp
    private fulfillmentService: FulfillmentService,  // Phụ thuộc trực tiếp
    private analyticsService: AnalyticsService,      // Phụ thuộc trực tiếp
  ) {}

  async createOrder(data: CreateOrderDto) {
    const order = await this.orderRepository.save(data);

    // OrderService phải biết về TẤT CẢ services liên quan
    await this.inventoryService.reserve(order.items);
    await this.emailService.sendConfirmation(order);
    await this.loyaltyService.addPoints(order);
    await this.fulfillmentService.createShipment(order);
    await this.analyticsService.trackPurchase(order);

    return order;
  }
}

// Thêm NotificationService mới → phải sửa OrderService → vi phạm Open/Closed Principle
```

**EDA giải quyết bằng cách tách coupling:**

```typescript
class OrderService {
  constructor(private eventBus: EventBusService) {}  // Chỉ phụ thuộc EventBus

  async createOrder(data: CreateOrderDto) {
    const order = await this.orderRepository.save(data);

    // OrderService không biết và không cần biết ai đang subscribe
    await this.eventBus.emit(new OrderCreatedEvent(order));

    return order;
  }
}

// InventoryService — subscribe và xử lý khi cần
@OnEvent(OrderCreatedEvent)
async handleOrderCreated(event: OrderCreatedEvent) {
  await this.reserve(event.order.items);
}

// EmailService — subscribe riêng lẻ
@OnEvent(OrderCreatedEvent)
async handleOrderCreated(event: OrderCreatedEvent) {
  await this.sendConfirmation(event.order);
}

// Thêm service mới? KHÔNG cần sửa OrderService!
```

### 2.2 Temporal Decoupling

```
Direct call (tight coupling):
OrderService ──── đồng bộ ────> EmailService
                                   │ Nếu Email Service down → Order fail!

Event-driven (temporal decoupling):
OrderService ──── emit event ──── tách rời theo thời gian
                                      │
                           Email Service (có thể down)
                           khi online lại → nhận event từ queue
```

### 2.3 Publish-Subscribe Pattern

```
                  EventBus
                     │
      ┌──────────────┼──────────────┐
      │              │              │
 InventoryHandler  EmailHandler  LoyaltyHandler
      │              │              │
 Reserve stock    Send email    Add points
```

---

## 3. nestjs-boot EventBusModule

### 3.1 Định nghĩa Events

File: `src/events/boot-event.ts`

```typescript
// Tạo base event class (extends BootEvent)
import { BootEvent } from 'nestjs-boot';

// Domain Events — mô tả điều đã xảy ra
export class OrderCreatedEvent extends BootEvent {
  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly items: OrderItem[],
    public readonly total: number,
  ) {
    super();
  }
}

export class PaymentProcessedEvent extends BootEvent {
  constructor(
    public readonly orderId: string,
    public readonly paymentId: string,
    public readonly amount: number,
    public readonly method: 'credit_card' | 'paypal' | 'crypto',
  ) {
    super();
  }
}

export class InventoryUpdatedEvent extends BootEvent {
  constructor(
    public readonly sku: string,
    public readonly previousStock: number,
    public readonly newStock: number,
    public readonly reason: 'order' | 'restock' | 'adjustment',
  ) {
    super();
  }
}
```

### 3.2 Setup EventBusModule

```typescript
// app.module.ts
import { EventBusModule } from 'nestjs-boot';

@Module({
  imports: [
    // Memory transport — in-process, không cần Redis
    EventBusModule.register({ transport: 'memory' }),

    // Redis transport — cross-service pub/sub
    // EventBusModule.register({
    //   transport: 'redis',
    //   redis: { url: 'redis://localhost:6379' },
    // }),
  ],
})
export class AppModule {}
```

### 3.3 Emit Events

File: `src/events/event-bus.service.ts`

```typescript
// order.service.ts
import { Injectable } from '@nestjs/common';
import { EventBusService } from 'nestjs-boot';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const order = await this.orderRepository.save({
      customerId: dto.customerId,
      items: dto.items,
      total: dto.total,
      status: 'pending',
    });

    // Fire-and-forget: không chờ handlers hoàn thành
    await this.eventBus.emit(
      new OrderCreatedEvent(order.id, order.customerId, order.items, order.total)
    );

    return order;
  }

  async confirmPayment(orderId: string, paymentId: string): Promise<void> {
    const payment = await this.paymentRepository.save({ orderId, paymentId });

    // Chờ TẤT CẢ handlers hoàn thành trước khi tiếp tục
    await this.eventBus.emitAsync(
      new PaymentProcessedEvent(orderId, paymentId, payment.amount, payment.method)
    );
  }
}
```

### 3.4 Subscribe to Events với @OnEvent

File: `src/events/decorators.ts`

```typescript
// notification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from 'nestjs-boot';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  @OnEvent(OrderCreatedEvent)
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    this.logger.log(`Sending order confirmation for ${event.orderId}`);
    await this.emailService.sendOrderConfirmation({
      orderId: event.orderId,
      customerId: event.customerId,
    });
  }

  @OnEvent(PaymentProcessedEvent)
  async handlePaymentProcessed(event: PaymentProcessedEvent): Promise<void> {
    await this.emailService.sendPaymentReceipt({
      orderId: event.orderId,
      amount: event.amount,
    });
  }
}
```

```typescript
// inventory.service.ts
@Injectable()
export class InventoryService {

  @OnEvent(OrderCreatedEvent)
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    // Giảm stock cho từng item
    for (const item of event.items) {
      const prev = await this.getStock(item.sku);
      await this.reserveStock(item.sku, item.quantity);
      const next = await this.getStock(item.sku);

      await this.eventBus.emit(
        new InventoryUpdatedEvent(item.sku, prev, next, 'order')
      );
    }
  }
}
```

### 3.5 Query Bus với @OnQuery (breaking circular deps)

Vấn đề: Nếu OrderService cần UserService và UserService cần OrderService → Circular dependency!

```typescript
// Giải pháp: dùng Query Bus thay vì inject trực tiếp

// 1. Định nghĩa Query class
export class GetUserByIdQuery extends BootEvent {
  constructor(public readonly userId: string) { super(); }
}

// 2. UserService register handler (không import OrderService)
@Injectable()
export class UserService {
  @OnQuery(GetUserByIdQuery)
  async handleGetUser(query: GetUserByIdQuery): Promise<User> {
    return this.userRepository.findById(query.userId);
  }
}

// 3. OrderService gọi mà không import UserService
@Injectable()
export class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async getOrderWithUser(orderId: string) {
    const order = await this.orderRepository.findById(orderId);

    // Không cần inject UserService — không có circular dep!
    const user = await this.eventBus.emitAndWait<User>(
      new GetUserByIdQuery(order.userId),
      { timeout: 5000 }
    );

    return { order, user };
  }
}
```

---

## 4. CQRS — Command Query Responsibility Segregation

### 4.1 Vấn đề CQRS giải quyết

```
Tình huống thực tế:
- Viết (Write): Cần validation phức tạp, business rules, normalization
- Đọc (Read): Cần denormalized data, join nhiều bảng, cần rất nhanh

→ Cùng 1 model cho cả read lẫn write → compromise cả 2
```

**Ví dụ:** Dashboard admin cần hiển thị Order với thông tin User, Product, Payment trong 1 response. Nhưng Order domain model chỉ lưu foreign key IDs.

```
WITHOUT CQRS:
GET /orders/123 →
  1. SELECT * FROM orders WHERE id = 123
  2. SELECT * FROM users WHERE id = order.user_id
  3. SELECT * FROM products WHERE id IN (order.product_ids)
  4. SELECT * FROM payments WHERE order_id = 123
  → 4 queries, slow, complex ORM code

WITH CQRS:
GET /orders/123 →
  Query: SELECT o.*, u.name, p.name, pay.amount
         FROM orders_view o   ← Denormalized view/materialized view
         JOIN ...
  → 1 query, blazing fast
```

### 4.2 CQRS Architecture

```
                    ┌────────────────────────────────┐
                    │          Application            │
                    └──────────────┬─────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                                         │
    ┌─────────▼─────────┐               ┌──────────────▼──────┐
    │    Command Side    │               │     Query Side       │
    │                    │               │                      │
    │  CreateOrder       │               │  GetOrder            │
    │  ProcessPayment    │               │  ListOrders          │
    │  CancelOrder       │               │  GetOrderDashboard   │
    │                    │               │                      │
    │  ← Normalized DB → │               │  ← Read Model/View → │
    │  → Events →        │               │  (Denormalized,      │
    │                    │               │   optimized for UI)  │
    └────────────────────┘               └──────────────────────┘
              │                                    ▲
              │ Events                             │ Projections
              └─────────────────── EventBus ───────┘
                              (update read model)
```

### 4.3 nestjs-boot CommandBus

File: `src/cqrs/command-bus.ts`

```typescript
// 1. Định nghĩa Command
export class CreateOrderCommand implements ICommand {
  readonly type = 'CreateOrder';

  constructor(
    public readonly customerId: string,
    public readonly items: { sku: string; qty: number; price: number }[],
  ) {}
}

// 2. Implement Command Handler
@CommandHandler(CreateOrderCommand)
@Injectable()
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly eventBus: EventBusService,
    private readonly eventStore: EventStore,  // Event Sourcing
  ) {}

  async execute(command: CreateOrderCommand): Promise<string> {
    // Business validation
    if (command.items.length === 0) {
      throw new BadRequestException('Order must have at least 1 item');
    }

    const total = command.items.reduce((sum, i) => sum + i.price * i.qty, 0);

    // Create aggregate
    const order = Order.create(command.customerId, command.items, total);

    // Save to write model (normalized)
    await this.orderRepository.save(order);

    // Save events to EventStore (for event sourcing)
    await this.eventStore.save(order.getUncommittedEvents());

    // Publish domain events
    for (const event of order.getUncommittedEvents()) {
      await this.eventBus.emit(event);
    }

    return order.id;
  }
}

// 3. Đăng ký handler
@Module({
  providers: [CreateOrderHandler],
})
export class OrderCommandModule {}
```

```typescript
// 4. Sử dụng CommandBus từ Controller
@Controller('orders')
export class OrderController {
  constructor(
    @Inject(CQRS_COMMAND_BUS) private readonly commandBus: CommandBus,
  ) {}

  @Post()
  async createOrder(@Body() dto: CreateOrderDto): Promise<{ id: string }> {
    const orderId = await this.commandBus.execute<string>(
      new CreateOrderCommand(dto.customerId, dto.items)
    );
    return { id: orderId };
  }
}
```

```typescript
// 5. Query Handler — đọc từ denormalized read model
@Controller('orders')
export class OrderController {

  @Get(':id')
  async getOrder(@Param('id') id: string): Promise<OrderDetailView> {
    // Query đọc từ read model — không qua CommandBus
    return this.orderReadRepository.findDetailById(id);
  }

  @Get()
  async listOrders(@Query() filters: OrderFiltersDto): Promise<OrderListView[]> {
    return this.orderReadRepository.findWithFilters(filters);
  }
}
```

### 4.4 Setup CqrsModule

File: `src/cqrs/cqrs.module.ts`

```typescript
// app.module.ts
import { CqrsModule } from 'nestjs-boot';

@Module({
  imports: [
    CqrsModule.register({
      eventStore: 'memory',           // 'memory' | 'mongodb'
      snapshotStore: 'memory',        // Optional: cache aggregate state
      snapshotFrequency: 100,         // Tạo snapshot mỗi 100 events
      outbox: {
        enabled: true,                // Outbox pattern
        pollInterval: 1000,           // Poll mỗi giây
        maxRetries: 5,
      },
    }),
  ],
})
export class AppModule {}
```

---

## 5. Event Sourcing — Lưu Events, Không Lưu State

### 5.1 Khái niệm

```
TRADITIONAL (lưu state):
orders collection:
{ id: "123", status: "shipped", total: 99.99, updatedAt: ... }

→ Biết trạng thái HIỆN TẠI, nhưng mất lịch sử!
→ "Order đã từng bị cancel rồi restore không?"  → Không biết!

EVENT SOURCING (lưu events):
events collection:
{ orderId: "123", type: "OrderCreated",   data: {...}, timestamp: ... }
{ orderId: "123", type: "PaymentProcessed", data: {...}, timestamp: ... }
{ orderId: "123", type: "OrderCancelled",  data: {...}, timestamp: ... }
{ orderId: "123", type: "OrderRestored",   data: {...}, timestamp: ... }
{ orderId: "123", type: "OrderShipped",   data: {...}, timestamp: ... }

→ Có đầy đủ lịch sử!
→ "Order đang ở trạng thái gì?" → Replay events từ đầu → state hiện tại
→ "Order ở trạng thái gì lúc 14:32?" → Replay đến 14:32 → time-travel query!
```

### 5.2 AggregateRoot

File: `src/cqrs/aggregate-root.ts`

```typescript
// order.aggregate.ts
import { AggregateRoot } from 'nestjs-boot';
import { DomainEvent } from 'nestjs-boot';

export class Order extends AggregateRoot {
  private _status: string = 'draft';
  private _total: number = 0;
  private _customerId: string = '';
  private _items: OrderItem[] = [];

  // Factory method — chỉ tạo qua factory, không dùng constructor trực tiếp
  static create(customerId: string, items: OrderItem[], total: number): Order {
    const order = new Order();
    order.id = randomUUID();

    // Luôn dùng apply() thay vì set trực tiếp
    // apply() = lưu event + cập nhật state
    order.apply(new OrderCreatedEvent(order.id, customerId, items, total));
    return order;
  }

  ship(): void {
    if (this._status !== 'confirmed') {
      throw new BadRequestException('Cannot ship unconfirmed order');
    }
    this.apply(new OrderShippedEvent(this.id));
  }

  cancel(reason: string): void {
    if (this._status === 'shipped') {
      throw new BadRequestException('Cannot cancel shipped order');
    }
    this.apply(new OrderCancelledEvent(this.id, reason));
  }

  // PHẢI implement applyEvent — cập nhật state từ event
  applyEvent(event: DomainEvent): void {
    if (event instanceof OrderCreatedEvent) {
      this._status = 'pending';
      this._customerId = event.customerId;
      this._items = event.items;
      this._total = event.total;
    } else if (event instanceof OrderShippedEvent) {
      this._status = 'shipped';
    } else if (event instanceof OrderCancelledEvent) {
      this._status = 'cancelled';
    }
  }

  // Getters (không cho phép set state trực tiếp từ bên ngoài)
  get status() { return this._status; }
  get total() { return this._total; }
}
```

```typescript
// order.repository.ts — tái tạo aggregate từ event history
@Injectable()
export class OrderRepository {
  constructor(
    @Inject(CQRS_EVENT_STORE) private readonly eventStore: EventStore,
  ) {}

  async findById(id: string): Promise<Order> {
    const events = await this.eventStore.getEvents(id);
    if (events.length === 0) throw new NotFoundException(`Order ${id} not found`);

    const order = new Order();
    order.id = id;

    // Replay tất cả events → recreate state
    for (const event of events) {
      order.applyEvent(event.data);
    }

    return order;
  }

  async save(order: Order): Promise<void> {
    const uncommitted = order.getUncommittedEvents();
    await this.eventStore.saveEvents(order.id, uncommitted, order.version);
    order.clearUncommittedEvents();
  }
}
```

---

## 6. Saga Pattern — Distributed Transactions

### 6.1 Vấn đề

```
Tạo order = 3 steps qua 3 services:
1. Reserve Inventory (Inventory Service)
2. Charge Payment (Payment Service)
3. Create Shipment (Fulfillment Service)

Step 1 OK, Step 2 OK, Step 3 FAIL
→ Inventory đã reserve, Payment đã charge
→ Phải ROLLBACK cả 2 steps trước!

Trong distributed system = không có 2-phase commit thực sự
→ Cần SAGA pattern
```

### 6.2 Compensating Actions

```
Saga Choreography:

OrderCreated
    │
    ├────> InventoryService: Reserve stock
    │           │ Success
    │      InventoryReserved
    │           │
    ├────> PaymentService: Charge payment
    │           │ FAIL
    │      PaymentFailed
    │           │
    └────> InventoryService: RELEASE stock ← Compensating action
               │
          InventoryReleased
               │
          OrderFailed → notify user
```

### 6.3 nestjs-boot Saga Builder

File: `src/cqrs/saga.ts`

```typescript
import { defineSaga, runSaga } from 'nestjs-boot';

interface OrderContext {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  inventoryReservationId?: string;
  paymentIntentId?: string;
}

// Định nghĩa saga với fluent builder
const createOrderSaga = defineSaga<OrderContext>('create-order')
  .step(
    'reserve-inventory',
    async (ctx) => {
      const reservationId = await inventoryService.reserve(ctx.items);
      ctx.inventoryReservationId = reservationId; // Lưu vào context để compensate
    },
    async (ctx, error) => {
      // Compensating action: release inventory
      if (ctx.inventoryReservationId) {
        await inventoryService.release(ctx.inventoryReservationId);
      }
      logger.log(`Inventory released for order ${ctx.orderId}`);
    },
  )
  .step(
    'charge-payment',
    async (ctx) => {
      const paymentId = await paymentService.charge({
        amount: ctx.total,
        customerId: ctx.customerId,
        orderId: ctx.orderId,
      });
      ctx.paymentIntentId = paymentId;
    },
    async (ctx, error) => {
      // Compensating action: refund payment
      if (ctx.paymentIntentId) {
        await paymentService.refund(ctx.paymentIntentId);
      }
      logger.log(`Payment refunded for order ${ctx.orderId}`);
    },
  )
  .step(
    'create-shipment',
    async (ctx) => {
      await fulfillmentService.createShipment({
        orderId: ctx.orderId,
        items: ctx.items,
      });
    },
    async (ctx, error) => {
      // Compensating action: cancel shipment
      await fulfillmentService.cancelShipment(ctx.orderId);
      logger.log(`Shipment cancelled for order ${ctx.orderId}`);
    },
  )
  .build();

// Chạy saga
@OnEvent(OrderCreatedEvent)
async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
  const result = await runSaga(createOrderSaga, {
    orderId: event.orderId,
    customerId: event.customerId,
    items: event.items,
    total: event.total,
  });

  if (result.success) {
    await this.eventBus.emit(new OrderConfirmedEvent(event.orderId));
  } else {
    // Compensation đã chạy, thông báo user
    await this.eventBus.emit(new OrderFailedEvent(event.orderId, result.error?.message));
  }
}
```

---

## 7. Outbox Pattern — Reliable Event Publishing

### 7.1 Dual-Write Problem

```
Vấn đề kinh điển:
const order = await this.orderRepository.save(data);  // Step 1: Lưu DB
await this.eventBus.emit(new OrderCreatedEvent(order)); // Step 2: Publish event

Nếu crash GIỮA step 1 và 2?
→ DB có order nhưng event KHÔNG được publish
→ Inventory không được reserve
→ Email không được gửi
→ Data inconsistent!

Ngược lại:
await this.eventBus.emit(...);  // Step 1
await this.orderRepository.save(data);  // Step 2 — FAIL

→ Event đã publish nhưng order KHÔNG được lưu
→ Inventory bị reserve ảo
→ Còn tệ hơn!
```

### 7.2 Giải pháp: Outbox Pattern

```
OUTBOX PATTERN:

1. Trong CÙNG 1 database transaction:
   BEGIN TRANSACTION
     INSERT orders (...)           ← Lưu order
     INSERT outbox (event: OrderCreated, status: pending)  ← Lưu event vào outbox
   COMMIT

   → Cả 2 hoặc không cái nào (ACID)

2. OutboxProcessor (background task):
   LOOP every 1 second:
     SELECT * FROM outbox WHERE status = 'pending'
     FOR each event:
       eventBus.emit(event)
       UPDATE outbox SET status = 'published'

   → Dù crash ở bước nào, outbox vẫn có record
   → Khi restart, processor tiếp tục publish
   → At-least-once delivery (idempotent consumers cần xử lý duplicate)
```

### 7.3 nestjs-boot OutboxProcessor

File: `src/cqrs/outbox-processor.ts`

```typescript
// OutboxProcessor tự động start khi CqrsModule.register({ outbox: { enabled: true } })

// Cách sử dụng trong command handler:
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler {
  constructor(
    @Inject(CQRS_EVENT_STORE) private eventStore: EventStore,
    private orderRepository: OrderRepository,
  ) {}

  async execute(command: CreateOrderCommand): Promise<string> {
    const order = Order.create(command.customerId, command.items, command.total);

    // Lưu aggregate state + events vào DB trong cùng transaction
    // OutboxProcessor sẽ publish events sau
    await this.orderRepository.saveWithOutbox(order);

    return order.id;
  }
}
```

---

## 8. Hands-on: Implement Event-Driven Order Flow

### Bước 1: Setup modules

```typescript
// app.module.ts
@Module({
  imports: [
    EventBusModule.register({ transport: 'memory' }),
    CqrsModule.register({ eventStore: 'memory' }),
    OrderModule,
    InventoryModule,
    NotificationModule,
  ],
})
export class AppModule {}
```

### Bước 2: Tạo events và handlers

```bash
# Cấu trúc thư mục
src/
  orders/
    commands/
      create-order.command.ts
      create-order.handler.ts
    events/
      order-created.event.ts
      order.aggregate.ts
    order.module.ts
    order.service.ts
  inventory/
    handlers/
      order-created.handler.ts  ← subscribe to OrderCreated
    inventory.module.ts
  notifications/
    handlers/
      order-created.handler.ts  ← subscribe to OrderCreated
    notification.module.ts
```

### Bước 3: Test end-to-end flow

```typescript
// Kiểm tra event được emit và subscribers nhận được
it('should notify all services when order created', async () => {
  const inventorySpy = jest.spyOn(inventoryService, 'reserve');
  const emailSpy = jest.spyOn(notificationService, 'sendOrderConfirmation');

  await request(app.getHttpServer())
    .post('/orders')
    .send({ customerId: 'user-1', items: [{ sku: 'SKU-001', qty: 1 }] })
    .expect(201);

  // Chờ async handlers
  await new Promise(resolve => setTimeout(resolve, 100));

  expect(inventorySpy).toHaveBeenCalledWith(expect.objectContaining({ sku: 'SKU-001' }));
  expect(emailSpy).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'user-1' }));
});
```

---

## 9. Bài tập thực hành

### Exercise: Saga — Order → Payment → Fulfillment

Implement full saga với compensating actions:

**Happy path:**
```
CreateOrder → ReserveInventory → ChargePayment → CreateShipment → OrderConfirmed
```

**Sad path (Payment fail):**
```
CreateOrder → ReserveInventory → ChargePayment FAIL → ReleaseInventory → OrderFailed
```

**Yêu cầu:**
1. Implement `CreateOrderSaga` với 3 steps
2. Mỗi step có execute + compensate function
3. Nếu bất kỳ step nào fail → chạy compensating actions ngược lại
4. Emit `OrderConfirmedEvent` hoặc `OrderFailedEvent` sau khi saga kết thúc
5. Viết test cho cả happy path và sad path

### Homework

1. Giải thích sự khác biệt giữa **Saga Choreography** và **Saga Orchestration**. Khi nào dùng cái nào?
2. Event Sourcing có nhược điểm gì? (Gợi ý: schema evolution khi event format thay đổi)
3. CQRS có phải lúc nào cũng cần Event Sourcing không? Giải thích.

---

## 10. Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `No handler registered for query` | `@OnQuery` handler chưa được provide trong module | Thêm handler class vào `providers` và import module vào AppModule |
| Event handlers không được gọi | `@OnEvent` class chưa được inject | Class phải là `@Injectable()` và có trong `providers` |
| Saga không rollback | Compensating action không được implement | Mỗi `.step()` phải có 3 args: name, execute, compensate |
| Duplicate events | Consumer không idempotent + at-least-once delivery | Implement idempotency key check trong event handler |
| Circular dependency | Service A inject Service B và ngược lại | Dùng Query Bus thay vì inject trực tiếp |
| Aggregate state sai | `applyEvent()` không được implement đầy đủ | Check tất cả event types trong switch/if-else của `applyEvent()` |

---

## 11. Self-check Questions

1. Phân biệt `emit()` và `emitAsync()` trong EventBusService. Khi nào dùng cái nào?
2. CQRS tách read/write model để làm gì? Nó giải quyết vấn đề gì?
3. Event Sourcing lưu gì trong database? State hay events? Tại sao?
4. Vẽ sơ đồ Saga flow khi tạo order bị thất bại ở bước ChargePayment.
5. Dual-write problem là gì? Outbox pattern giải quyết như thế nào?

---

## 12. Đọc thêm

- [Martin Fowler — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Martin Fowler — CQRS](https://martinfowler.com/bliki/CQRS.html)
- [Saga Pattern](https://microservices.io/patterns/data/saga.html) — microservices.io
- [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [nestjs-boot source] `src/events/` — EventBusModule, @OnEvent, @OnQuery
- [nestjs-boot source] `src/cqrs/` — CqrsModule, CommandBus, AggregateRoot, Saga, Outbox

---

*Tuần trước: [Tuần 10 — Message Queue](./week-10-queue.md)*
*Tuần tiếp theo: [Tuần 12 — Observability](./week-12-observability.md)*
