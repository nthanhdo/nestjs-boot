# Hướng dẫn ngăn chặn Circular Dependency

> **nestjs-boot** xử lý circular dependency như vấn đề thiết kế, không phải vấn đề runtime.
> Hướng dẫn này cung cấp các pattern copy-paste để loại bỏ chúng.

---

## Tại sao Circular Dependency xảy ra

Năm lực lượng kiến trúc tạo ra vòng lặp khi ứng dụng NestJS phát triển:

| Lực lượng | Ví dụ | Tần suất |
|-------|---------|-----------|
| **Service dùng chung** | `UserService` cần ở khắp nơi; cuối cùng cần `OrderService` ngược lại | Rất phổ biến ở 20+ module |
| **Guard import business** | `AuthGuard` cần `UserService`; `UserModule` cần `AuthGuard` | Phổ biến |
| **Listener tác động phụ** | `NotificationModule` lắng nghe `OrderCreated`, cần chi tiết order | Phổ biến |
| **God-module** | `SharedModule` hấp thụ quá nhiều dep, tạo vòng lặp bắc cầu | Dần dần |
| **Barrel file** | `index.ts` re-export gây reference-before-define (`undefined` trong import) | Tinh vi |

Ở 5 module bạn có ~5% cơ hội vòng lặp. Ở 30 module, ~60%. Ở 50+, gần như chắc chắn.

---

## Cây quyết định: Dùng Pattern nào?

```
Lời gọi cross-module có phải TÁC ĐỘNG PHỤ không?
(ví dụ: "gửi thông báo sau khi tạo order")
│
├── CÓ ──► Pattern 1: Event Fire-and-Forget
│           eventBus.emit(new OrderCreatedEvent(...))
│
└── KHÔNG ── Bạn CẦN giá trị trả về?
          │
          ├── CÓ ──► Pattern 2: Query qua emitAndWait()
          │           const user = await eventBus.emitAndWait(new GetUserByIdQuery(id))
          │
          └── KHÔNG ── Đây là mối quan tâm xuyên suốt (auth, logging, caching)?
                    │
                    ├── CÓ ──► Pattern 3: Contract / Token Injection
                    │           @Inject(USER_LOOKUP) private userLookup: IUserLookup
                    │
                    └── KHÔNG ── Đây là giải pháp tạm thời khi refactor?
                              │
                              ├── CÓ ──► Pattern 4: forwardRef() (biện pháp cuối)
                              │
                              └── KHÔNG ──► Pattern 5: Phân lớp Module (tái cấu trúc)
```

---

## Pattern 1: Thay lời gọi trực tiếp bằng Event (fire-and-forget)

**Dùng khi:** Người gọi không cần giá trị trả về. Lời gọi cross-module là tác động phụ (thông báo, analytics, audit log, tăng bộ đếm).

### Trước (circular dependency)

```ts
// order/order.service.ts
import { UserService } from '../user/user.service';           // <- yêu cầu import UserModule
import { NotificationService } from '../notification/notification.service'; // <- yêu cầu import NotificationModule

@Injectable()
export class OrderService {
  constructor(
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
  ) {}

  async createOrder(userId: string, items: Item[]) {
    const user = await this.userService.findById(userId);
    const order = await this.orderRepo.create({ userId, items });

    // Tác động phụ tạo circular dep:
    await this.notificationService.sendOrderConfirmation(user, order);
    await this.userService.incrementOrderCount(userId);

    return order;
  }
}
```

```ts
// order/order.module.ts
@Module({
  imports: [UserModule, NotificationModule], // <- cạnh tạo vòng lặp
  providers: [OrderService],
})
export class OrderModule {}
```

### Sau (event-driven, không import cross-module)

**Bước 1: Định nghĩa event**

```ts
// order/events/order-created.event.ts
import { BootEvent } from 'nestjs-boot';

export class OrderCreatedEvent extends BootEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly items: Item[],
  ) {
    super();
  }
}
```

**Bước 2: Emit event (không import UserModule hay NotificationModule)**

```ts
// order/order.service.ts
import { EventBusService } from 'nestjs-boot';
import { OrderCreatedEvent } from './events/order-created.event';

@Injectable()
export class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async createOrder(userId: string, items: Item[]) {
    const order = await this.orderRepo.create({ userId, items });

    // Fire-and-forget: không cần import cross-module
    await this.eventBus.emit(new OrderCreatedEvent(order.id, userId, items));

    return order;
  }
}
```

**Bước 3: Lắng nghe trong mỗi module (không import OrderModule)**

```ts
// user/handlers/user-event-handlers.service.ts
import { Injectable } from '@nestjs/common';
import { OnEvent } from 'nestjs-boot';
import { OrderCreatedEvent } from '../../order/events/order-created.event';

@Injectable()
export class UserEventHandlers {
  constructor(private readonly userService: UserService) {}

  @OnEvent(OrderCreatedEvent)
  async onOrderCreated(event: OrderCreatedEvent) {
    await this.userService.incrementOrderCount(event.userId);
  }
}
```

```ts
// notification/handlers/notification-event-handlers.service.ts
@Injectable()
export class NotificationEventHandlers {
  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(OrderCreatedEvent)
  async onOrderCreated(event: OrderCreatedEvent) {
    await this.notificationService.sendOrderConfirmation(event.userId, event.orderId);
  }
}
```

**Bước 4: Cập nhật module (DAG sạch)**

```ts
// order/order.module.ts — KHÔNG import UserModule hay NotificationModule
@Module({
  providers: [OrderService],
})
export class OrderModule {}

// user/user.module.ts — KHÔNG import OrderModule
@Module({
  providers: [UserService, UserEventHandlers],
})
export class UserModule {}
```

**Đồ thị dependency:**
```
TRƯỚC (vòng lặp):                    SAU (DAG):
OrderModule <--> UserModule          OrderModule ----> EventBusModule (@Global)
OrderModule <--> NotificationModule                        |
                                                     +-----+-----+
                                                     v           v
                                                 UserModule   NotifModule
                                                 (lắng nghe)  (lắng nghe)
```

---

## Pattern 2: Query qua emitAndWait() (request/reply)

**Dùng khi:** Bạn CẦN giá trị trả về từ module khác nhưng không muốn import trực tiếp gây circular dependency. Đây là pattern quan trọng nhất để phá vỡ vòng lặp.

### Trước (circular dependency)

```ts
// order/order.service.ts
import { UserService } from '../user/user.service'; // <- circular dep

@Injectable()
export class OrderService {
  constructor(private readonly userService: UserService) {}

  async createOrder(userId: string, items: Item[]) {
    // CẦN đối tượng user trả về — không dùng fire-and-forget được
    const user = await this.userService.findById(userId);
    if (!user.isActive) throw new ForbiddenException('Inactive user');

    return this.orderRepo.create({ userId, items, userName: user.name });
  }
}
```

### Sau (emitAndWait, không import cross-module)

**Bước 1: Định nghĩa query (kế thừa BootQuery, không phải BootEvent)**

```ts
// shared/queries/get-user-by-id.query.ts
import { BootQuery } from 'nestjs-boot';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export class GetUserByIdQuery extends BootQuery<UserDto> {
  constructor(public readonly userId: string) {
    super();
  }
}
```

**Bước 2: Xử lý query trong UserModule**

```ts
// user/handlers/user-query-handlers.service.ts
import { Injectable } from '@nestjs/common';
import { OnQuery } from 'nestjs-boot';
import { GetUserByIdQuery, UserDto } from '../../shared/queries/get-user-by-id.query';

@Injectable()
export class UserQueryHandlers {
  constructor(private readonly userService: UserService) {}

  @OnQuery(GetUserByIdQuery)
  async handleGetUser(query: GetUserByIdQuery): Promise<UserDto> {
    return this.userService.findById(query.userId);
  }
}
```

**Bước 3: Gọi qua emitAndWait trong OrderModule**

```ts
// order/order.service.ts — KHÔNG import UserModule
import { EventBusService } from 'nestjs-boot';
import { GetUserByIdQuery, UserDto } from '../shared/queries/get-user-by-id.query';

@Injectable()
export class OrderService {
  constructor(private readonly eventBus: EventBusService) {}

  async createOrder(userId: string, items: Item[]) {
    // Request/reply — lấy user mà không import UserModule
    const user = await this.eventBus.emitAndWait<UserDto>(
      new GetUserByIdQuery(userId),
      { timeout: 5000 },
    );

    if (!user.isActive) throw new ForbiddenException('Inactive user');
    return this.orderRepo.create({ userId, items, userName: user.name });
  }
}
```

**Điểm chính:**
- `emitAndWait` ném lỗi nếu không có handler nào được đăng ký (với thông báo lỗi hữu ích)
- `emitAndWait` ném lỗi nếu handler không phản hồi trong timeout
- Chỉ MỘT handler cho mỗi query class (không giống event có thể có nhiều listener)
- Thư mục `shared/queries/` không import module nào — nó là node lá

---

## Pattern 3: Contract / Token Injection

**Dùng khi:** Bạn có mối quan tâm xuyên suốt (kiểm tra auth, tra cứu user) được dùng bởi nhiều module. Interface nằm ở vị trí chia sẻ với không dependency.

```ts
// shared/contracts/user-lookup.contract.ts (KHÔNG dependency)
export interface IUserLookup {
  findById(id: string): Promise<{ id: string; name: string; email: string }>;
}

export const USER_LOOKUP = 'IUserLookup';
```

```ts
// user/user.module.ts — cung cấp implementation
@Module({
  providers: [
    UserService,
    { provide: USER_LOOKUP, useExisting: UserService }, // UserService implement IUserLookup
  ],
  exports: [USER_LOOKUP],
})
export class UserModule {}
```

```ts
// order/order.service.ts — sử dụng qua token, KHÔNG import UserModule
import { Inject, Injectable } from '@nestjs/common';
import { IUserLookup, USER_LOOKUP } from '../shared/contracts/user-lookup.contract';

@Injectable()
export class OrderService {
  constructor(@Inject(USER_LOOKUP) private readonly userLookup: IUserLookup) {}

  async getOrderWithUser(orderId: string) {
    const order = await this.orderRepo.findById(orderId);
    const user = await this.userLookup.findById(order.userId);
    return { ...order, user };
  }
}
```

**Khi nào dùng cái này so với emitAndWait:**
- Pattern contract: khi dependency có cảm giác **đồng bộ** và module cung cấp luôn có mặt
- `emitAndWait`: khi các module nên **hoàn toàn tách rời** (ví dụ: team khác nhau, module tùy chọn)

---

## Pattern 4: forwardRef() (biện pháp cuối)

**Dùng khi:** Bạn cần sửa nhanh trong khi refactor sang pattern đúng. `forwardRef` là băng dán, không phải giải pháp.

```ts
// user/user.module.ts
@Module({
  imports: [forwardRef(() => OrderModule)],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

// order/order.module.ts
@Module({
  imports: [forwardRef(() => UserModule)],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
```

**Khi KHÔNG dùng forwardRef:**
- Hơn 2 cặp `forwardRef` trong app = vấn đề cấu trúc, sửa bằng Pattern 1/2/3
- Vòng lặp bắc cầu (A -> B -> C -> A) = `forwardRef` không giải được
- Test trở nên khó cách ly hơn với `forwardRef`

---

## Pattern 5: Phân lớp Module

Tổ chức module thành lớp nơi dependency chỉ chảy xuống:

```
Lớp 0: Hạ tầng     (@Global — DB, Cache, EventBus, Auth)
    ^
Lớp 1: Domain/Core  (entity, value object, contract)
    ^
Lớp 2: Tính năng    (User, Order, Payment — chỉ import Lớp 0+1)
    ^
Lớp 3: Điều phối    (Saga, Workflow — import Lớp 0+1+2)
    ^
Lớp 4: Trình bày    (Controller, Gateway — import bất kỳ lớp nào)
```

**Quy tắc:** Module tính năng (Lớp 2) không bao giờ import lẫn nhau trực tiếp. Chúng giao tiếp qua EventBusModule (Lớp 0) hoặc contract chia sẻ (Lớp 1).

---

## Anti-Pattern (những gì KHÔNG nên làm)

### 1. God-module
```ts
// KHÔNG: SharedModule import nửa app
@Module({
  imports: [UserModule, OrderModule, PaymentModule, NotificationModule, AnalyticsModule],
  exports: [UserModule, OrderModule, PaymentModule, NotificationModule, AnalyticsModule],
})
export class SharedModule {} // <- Đây CHÍNH LÀ vấn đề
```

### 2. Barrel file re-export tất cả
```ts
// KHÔNG: modules/index.ts
export * from './user/user.module';
export * from './order/order.module';
// TypeScript đánh giá từ trên xuống; một cái nhận undefined
```

### 3. Guard import business service trực tiếp
```ts
// KHÔNG: AuthGuard phụ thuộc vào UserService đầy đủ
@Injectable()
export class AuthGuard {
  constructor(private readonly userService: UserService) {} // <- cần import UserModule
}

// NÊN: AuthGuard phụ thuộc vào contract tối thiểu
@Injectable()
export class AuthGuard {
  constructor(@Inject(USER_LOOKUP) private readonly userLookup: IUserLookup) {}
}
```

### 4. Bỏ qua cảnh báo nestjs-boot
Trong dev mode, nestjs-boot quét đồ thị module sau khi khởi động và cảnh báo về:
- **Import qua lại** (Module A import Module B VÀ B import A)
- **Dấu hiệu god-module** (module nào import >10 module khác)

Các cảnh báo này không chặn nhưng chỉ ra rủi ro kiến trúc. Sửa chúng trước khi chúng trở thành crash circular dep.

---

## Checklist: 5 dấu hiệu codebase có rủi ro Circular Dep

- [ ] Bạn có bất kỳ `forwardRef()` nào trong codebase
- [ ] Một module được import bởi hơn 8 module khác
- [ ] `SharedModule` hoặc `CommonModule` đã phát triển vượt qua tiện ích
- [ ] Guard hoặc interceptor inject business service (không phải contract)
- [ ] Thêm module tính năng mới yêu cầu thay đổi 3+ import module hiện có

Nếu bạn đánh dấu 2+ ô, áp dụng Pattern 1-3 từ hướng dẫn này một cách chủ động.

---

## Tham chiếu nhanh

| Tôi cần... | Dùng | Cần import? |
|---|---|---|
| Thông báo module khác (không cần phản hồi) | `eventBus.emit(new XxxEvent(...))` | Chỉ event class (file lá) |
| Lấy dữ liệu từ module khác | `eventBus.emitAndWait(new XxxQuery(...))` | Chỉ query class (file lá) |
| Inject service xuyên suốt | `@Inject(TOKEN) private svc: IContract` | Chỉ file contract (file lá) |
| Sửa nhanh khi refactor | `forwardRef(() => OtherModule)` | Module đầy đủ (tạm thời) |
