# Phân quyền (Authorization / RBAC)

Kiểm soát truy cập dựa trên role và permission qua `RolesGuard` và `PermissionsGuard`, kích hoạt qua cấu hình RBAC của `AuthModule`.

## Thiết lập

Bật RBAC trong `AuthModule.register()`:

```ts
import { AuthModule } from 'nestjs-boot';

@Module({
  imports: [
    AuthModule.register({
      jwt: {
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '1h' },
      },
      rbac: {
        enabled: true,
        extractRoles: (req) => req.user?.roles ?? [],
        extractPermissions: (req) => req.user?.permissions ?? [],
      },
    }),
  ],
})
export class AppModule {}
```

Khi `rbac.enabled` là true, cả `RolesGuard` và `PermissionsGuard` đều được đăng ký làm global guard (qua `APP_GUARD`). Chúng chạy sau `JwtAuthGuard`, nên `request.user` đã được gán sẵn.

## @Roles() — Khớp BẤT KỲ

Route được gắn `@Roles()` yêu cầu user có **ít nhất một** trong các role được liệt kê.

```ts
import { Roles } from 'nestjs-boot';

@Controller('admin')
export class AdminController {
  @Roles('admin', 'manager')
  @Get('dashboard')
  getDashboard() {
    // Accessible if user has 'admin' OR 'manager' role
    return this.dashboardService.getData();
  }

  @Roles('admin')
  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    // Only 'admin' role
    return this.userService.delete(id);
  }
}
```

Route **không có** `@Roles()` thì không bị hạn chế (guard cho đi qua).

Nếu user thiếu role yêu cầu, trả về `403 Forbidden` với thông báo `"Insufficient role"`.

## @Permissions() — Khớp TẤT CẢ

Route được gắn `@Permissions()` yêu cầu user có **tất cả** permission được liệt kê.

```ts
import { Permissions } from 'nestjs-boot';

@Controller('products')
export class ProductsController {
  @Permissions('product:read')
  @Get()
  list() {
    return this.productService.findAll();
  }

  @Permissions('product:read', 'product:write')
  @Post()
  create(@Body() dto: CreateProductDto) {
    // User must have BOTH 'product:read' AND 'product:write'
    return this.productService.create(dto);
  }
}
```

Route **không có** `@Permissions()` thì không bị hạn chế. Thiếu permission sẽ throw `403 Forbidden` với `"Insufficient permissions"`.

## Kết hợp Roles và Permissions

Cả hai guard chạy độc lập. Route có cả hai decorator yêu cầu kiểm tra role VÀ kiểm tra permission đều phải đạt:

```ts
@Roles('admin', 'manager')
@Permissions('report:export')
@Get('export')
exportReport() {
  // Must have (admin OR manager) AND report:export
}
```

## extractRoles / extractPermissions

Mặc định, role được đọc từ `request.user.roles` và permission từ `request.user.permissions`. Ghi đè bằng extractor tùy chỉnh khi JWT payload hoặc user model của bạn có cấu trúc khác:

```ts
AuthModule.register({
  jwt: { secret: '...' },
  rbac: {
    enabled: true,
    extractRoles: (req) => {
      // Custom: roles nested under realm_access (Keycloak style)
      return req.user?.realm_access?.roles ?? [];
    },
    extractPermissions: (req) => {
      // Custom: flatten resource_access permissions
      const resources = req.user?.resource_access ?? {};
      return Object.values(resources).flatMap((r: any) => r.roles ?? []);
    },
  },
})
```

## Kết hợp với API Key Auth

Khi dùng API key auth, `validate` có thể trả về permission được gắn vào `request.user.permissions`. Chúng hoạt động với `@Permissions()` ngay lập tức:

```ts
AuthModule.register({
  apiKey: {
    enabled: true,
    validate: async (key) => {
      const record = await db.apiKeys.findOne({ key });
      if (!record) return false;
      return { valid: true, permissions: ['product:read', 'order:read'] };
    },
  },
  rbac: { enabled: true },
})
```

## Bypass @Public()

Cả hai guard đều tôn trọng `@Public()`. Route public bỏ qua auth VÀ authorization:

```ts
@Public()
@Get('health')
health() {
  return { status: 'ok' }; // No JWT, no roles, no permissions checked
}
```

## Tùy chọn RBAC Config

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `enabled` | `boolean` | — | Bật RBAC guard toàn cục |
| `extractRoles` | `(req) => string[]` | `req.user?.roles ?? []` | Trích xuất danh sách role từ request |
| `extractPermissions` | `(req) => string[]` | `req.user?.permissions ?? []` | Trích xuất danh sách permission từ request |

## Best Practices

1. **Đưa role/permission vào JWT payload** khi ký. Điều này tránh truy vấn database trên mỗi request.
2. **Dùng permission cho kiểm soát chi tiết** (`product:read`, `product:write`) và role cho phân nhóm thô (`admin`, `manager`).
3. **Giữ chuỗi role/permission chữ thường và có namespace** (ví dụ `order:cancel`, `report:export`).
4. **Route không có decorator thì mở** (cho user đã xác thực). Hãy rõ ràng — thêm `@Roles()` hoặc `@Permissions()` cho mọi route nhạy cảm.
5. **Test cả trường hợp positive và negative.** Xác minh rằng user không có role/permission yêu cầu nhận được 403.
