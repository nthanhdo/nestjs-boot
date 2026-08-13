# Authorization (RBAC)

Role-based and permission-based access control via `RolesGuard` and `PermissionsGuard`, activated through `AuthModule`'s RBAC configuration.

## Setup

Enable RBAC in `AuthModule.register()`:

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

When `rbac.enabled` is true, both `RolesGuard` and `PermissionsGuard` are registered as global guards (via `APP_GUARD`). They run after `JwtAuthGuard`, so `request.user` is already populated.

## @Roles() — ANY Match

A route decorated with `@Roles()` requires the user to have **at least one** of the listed roles.

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

Routes **without** `@Roles()` are unrestricted (the guard passes through).

If the user lacks the required role, a `403 Forbidden` is thrown with message `"Insufficient role"`.

## @Permissions() — ALL Match

A route decorated with `@Permissions()` requires the user to have **every** listed permission.

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

Routes **without** `@Permissions()` are unrestricted. Missing permissions throw `403 Forbidden` with `"Insufficient permissions"`.

## Combining Roles and Permissions

Both guards run independently. A route with both decorators requires the role check AND the permission check to pass:

```ts
@Roles('admin', 'manager')
@Permissions('report:export')
@Get('export')
exportReport() {
  // Must have (admin OR manager) AND report:export
}
```

## extractRoles / extractPermissions

By default, roles are read from `request.user.roles` and permissions from `request.user.permissions`. Override with custom extractors when your JWT payload or user model uses a different shape:

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

## Combining with API Key Auth

When using API key auth, `validate` can return permissions that are attached to `request.user.permissions`. These work with `@Permissions()` out of the box:

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

## @Public() Bypass

Both guards respect `@Public()`. A public route skips auth AND authorization:

```ts
@Public()
@Get('health')
health() {
  return { status: 'ok' }; // No JWT, no roles, no permissions checked
}
```

## RBAC Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | — | Enable RBAC guards globally |
| `extractRoles` | `(req) => string[]` | `req.user?.roles ?? []` | Extract role list from request |
| `extractPermissions` | `(req) => string[]` | `req.user?.permissions ?? []` | Extract permission list from request |

## Best Practices

1. **Include roles/permissions in the JWT payload** at sign time. This avoids a database lookup on every request.
2. **Use permissions for fine-grained control** (`product:read`, `product:write`) and roles for coarse grouping (`admin`, `manager`).
3. **Keep role/permission strings lowercase and namespaced** (e.g. `order:cancel`, `report:export`).
4. **Routes without decorators are open** (to authenticated users). Be explicit — add `@Roles()` or `@Permissions()` to every sensitive route.
5. **Test both positive and negative cases.** Verify that a user without the required role/permission receives a 403.
