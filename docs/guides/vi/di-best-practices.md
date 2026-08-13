# Thực hành tốt nhất Dependency Injection

## Cạm bẫy Barrel File

NestJS phân giải dependency ở cấp module. Barrel file (`index.ts`) re-export từ nhiều module có thể gây **import vòng không mong muốn** vì TypeScript phân giải tất cả export một cách eager.

**Vấn đề:**
```ts
// shared/index.ts — re-export tất cả
export * from './user.service';   // import DatabaseModule
export * from './cache.service';  // import CacheModule
export * from './auth.service';   // import AuthModule → import UserService → vòng lặp!
```

**Sửa:** Import trực tiếp từ file nguồn, không qua barrel:
```ts
import { UserService } from '../shared/user.service';  // trực tiếp
import { UserService } from '../shared';                // barrel — rủi ro
```

## Pattern SharedModule

Khi nhiều module tính năng cần cùng provider, tạo `SharedModule`:

```ts
@Module({
  imports: [DatabaseModule, CacheModule],
  providers: [UserService, ProductService],
  exports: [UserService, ProductService],
})
export class SharedModule {}
```

Rồi import `SharedModule` trong mỗi module tính năng thay vì nhân bản provider.

**Quy tắc chính:** `SharedModule` chỉ nên chứa **service stateless** (không có provider request-scoped, không controller).

## Cảnh báo forwardRef

`forwardRef()` là dấu hiệu code. Nó có nghĩa hai module phụ thuộc lẫn nhau — một vấn đề thiết kế.

```ts
// Hoạt động nhưng dễ vỡ — tránh nếu có thể
@Module({
  imports: [forwardRef(() => OrderModule)],
})
export class UserModule {}
```

**Lựa chọn tốt hơn:**
1. **Tách logic chung** vào module thứ ba cả hai có thể import
2. **Sử dụng event** — `UserModule` emit `UserCreated`, `OrderModule` lắng nghe
3. **Inject qua interface** — định nghĩa abstract class/interface, bind trong module cha

`forwardRef` chấp nhận được cho:
- Quan hệ entity hai chiều (Mongoose populate)
- Chuyển đổi code cũ (tạm thời, ghi chú kế hoạch xóa)

## Cách createApp() tránh Circular Dependency

Kiến trúc `createApp()` của `nestjs-boot` ngăn các pattern circular dep phổ biến nhất:

1. **Module hạ tầng được đăng ký một lần, global** — `DatabaseModule`, `CacheModule`, `AuthModule` v.v. là `@Global()` và đăng ký ở root. Module tính năng không import gì từ hạ tầng — chúng chỉ `@Inject()` những gì cần.

2. **Không chia sẻ provider giữa module** — mỗi module hạ tầng sở hữu provider riêng. `CacheModule` cung cấp `MultiCacheService`; `DatabaseModule` cung cấp connection. Chúng không bao giờ import lẫn nhau.

3. **Config được tập trung** — `BootConfigModule` giữ tất cả config. Không module nào cần import module khác chỉ để đọc config.

4. **Guard và interceptor là global** — đăng ký qua `app.useGlobalInterceptors()` / `app.useGlobalFilters()` trong `createApp()`, không qua import module. Điều này loại bỏ hoàn toàn circular dep liên quan đến guard.

**Nếu bạn vẫn gặp circular dep trong code app:**
```bash
# Bật debug output NestJS để thấy chuỗi phân giải
NEST_DEBUG=true npm run start:dev
```

Debug output cho thấy chính xác provider nào không thể phân giải và toàn bộ chuỗi dependency.
