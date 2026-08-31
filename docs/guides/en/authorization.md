# Authorization (RBAC)

> **TL;DR** — Enable `rbac` in `AuthModule` to get global `RolesGuard` and `PermissionsGuard`. Use `@Roles('admin')` (ANY match) and `@Permissions('product:write')` (ALL match) on routes. Enable `denyByDefault: true` so undecorated routes are blocked. Add `hierarchy` for role inheritance, `superAdmin` for bypass, and `permissionStore` for DB-backed permissions.

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
        denyByDefault: true,
        superAdmin: 'SUPER_ADMIN',
        hierarchy: [
          { name: 'SUPER_ADMIN', inherits: ['ADMIN'] },
          { name: 'ADMIN', inherits: ['MANAGER'] },
          { name: 'MANAGER', inherits: ['MODERATOR'] },
          { name: 'MODERATOR', inherits: ['LEADER'] },
          { name: 'LEADER', inherits: ['STAFF'] },
          { name: 'STAFF', inherits: ['USER'] },
          { name: 'USER' },
        ],
        extractRoles: (req) => req.user?.roles ?? [],
        extractPermissions: (req) => req.user?.permissions ?? [],
      },
    }),
  ],
})
export class AppModule {}
```

When `rbac.enabled` is true, both `RolesGuard` and `PermissionsGuard` are registered as global guards (via `APP_GUARD`). They run after `JwtAuthGuard`, so `request.user` is already populated.

## RBAC Config Options (all 7 fields)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | — | Enable RBAC guards globally |
| `extractRoles` | `(req) => string[]` | `req.user?.roles ?? []` | Extract role list from request |
| `extractPermissions` | `(req) => string[]` | `req.user?.permissions ?? []` | Extract permission list from request |
| `denyByDefault` | `boolean` | `false` | When true, routes without `@Roles()` or `@Permissions()` are denied (403). `@Public()` routes still pass. |
| `hierarchy` | `RoleDefinition[]` | — | Role inheritance definitions. See [Role Hierarchy](#role-hierarchy) |
| `superAdmin` | `string` | — | Role name that bypasses all role/permission checks |
| `permissionStore` | `PermissionStore` | — | DB-backed permission store. See [PermissionStore](#permissionstore) |

## denyByDefault

By default, routes without `@Roles()` or `@Permissions()` pass through — any authenticated user can access them. This is dangerous in large applications where developers forget to add decorators.

Enable `denyByDefault: true` to flip this behavior:

```ts
rbac: {
  enabled: true,
  denyByDefault: true, // recommended for production
}
```

With `denyByDefault: true`:
- Routes with `@Roles()` or `@Permissions()` — checked as usual
- Routes with `@Public()` — still open (no auth required)
- Routes with **no decorator** — `403 Forbidden: "Access denied: no roles defined for this route"`

This forces developers to explicitly declare authorization on every route, preventing accidental exposure.

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

Missing permissions throw `403 Forbidden` with `"Insufficient permissions"`.

### Wildcard permissions

Permission matching supports glob-style wildcards:

- `*` — matches any permission
- `user:*` — matches `user:read`, `user:write`, `user:delete`, etc.
- `user:read` — exact match only

```ts
// A user with permission 'product:*' passes @Permissions('product:read')
// A user with permission '*' passes any @Permissions() check
```

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

## Role Hierarchy

Define role inheritance so higher roles automatically inherit capabilities of lower roles.

```ts
rbac: {
  enabled: true,
  hierarchy: [
    { name: 'SUPER_ADMIN', inherits: ['ADMIN'] },
    { name: 'ADMIN', inherits: ['MANAGER'] },
    { name: 'MANAGER', inherits: ['STAFF'] },
    { name: 'STAFF' },
  ],
}
```

**Direction semantics:** `inherits` means "also has the capabilities of." An `ADMIN` that inherits from `MANAGER` can access all routes that require `MANAGER`.

With this hierarchy, a user with role `ADMIN`:
- Passes `@Roles('ADMIN')` — direct match
- Passes `@Roles('MANAGER')` — inherited from ADMIN → MANAGER
- Passes `@Roles('STAFF')` — inherited from ADMIN → MANAGER → STAFF
- Fails `@Roles('SUPER_ADMIN')` — inheritance goes down, not up

### Role-attached permissions

Each `RoleDefinition` can also carry permissions that are resolved through the hierarchy:

```ts
hierarchy: [
  {
    name: 'ADMIN',
    inherits: ['MANAGER'],
    permissions: ['user:delete', 'system:configure'],
  },
  {
    name: 'MANAGER',
    inherits: ['STAFF'],
    permissions: ['user:create', 'user:update'],
  },
  {
    name: 'STAFF',
    permissions: ['user:read', 'task:read'],
  },
],
```

An `ADMIN` user now has permissions: `user:delete`, `system:configure`, `user:create`, `user:update`, `user:read`, `task:read` (all inherited).

### Cycle detection

`RoleHierarchy.validate()` detects circular dependencies:

```ts
const hierarchy = new RoleHierarchy(definitions);
const { valid, cycles } = hierarchy.validate();
if (!valid) {
  console.error('Circular role hierarchy detected:', cycles);
}
```

## superAdmin

A role name that bypasses all `@Roles()` and `@Permissions()` checks:

```ts
rbac: {
  enabled: true,
  superAdmin: 'SUPER_ADMIN',
}
```

A user with the `SUPER_ADMIN` role:
- Passes **every** `@Roles()` check
- Passes **every** `@Permissions()` check
- Is the only role that passes `@SuperAdminOnly()` (see below)

### @SuperAdminOnly decorator

Restrict a route to super-admins only — all other roles (even those in `@Roles()`) are rejected:

```ts
import { SuperAdminOnly } from 'nestjs-boot';

@Controller('system')
export class SystemController {
  @SuperAdminOnly()
  @Delete('reset-database')
  resetDatabase() {
    // Only SUPER_ADMIN can access this
  }
}
```

Non-super-admin users receive `403 Forbidden: "Super-admin access only"`.

## PermissionStore

For applications where permissions are managed in a database (not embedded in JWT), provide a `permissionStore`:

```ts
import { MemoryPermissionStore } from 'nestjs-boot';

rbac: {
  enabled: true,
  permissionStore: new MemoryPermissionStore(), // dev/test only
}
```

The `PermissionStore` interface:

```ts
interface PermissionStore {
  getUserPermissions(userId: string): Promise<string[]>;
  getUserRoles(userId: string): Promise<string[]>;
  assignRoles(userId: string, roles: string[]): Promise<void>;
  removeRoles(userId: string, roles: string[]): Promise<void>;
  assignPermissions(userId: string, permissions: string[]): Promise<void>;
  removePermissions(userId: string, permissions: string[]): Promise<void>;
  hasPermission(userId: string, permission: string, hierarchy?: RoleHierarchy): Promise<boolean>;
}
```

When `permissionStore` is configured, `PermissionsGuard` runs an **async path**: it fetches permissions from the store (by `request.user.id` or `request.user.sub`) and merges them with JWT-embedded permissions and hierarchy-resolved permissions. All sources are combined before checking.

**When to use:**
- JWT-embedded permissions — fast, no DB call per request. But permissions are stale until token refreshes.
- DB-backed `PermissionStore` — always current, but adds a DB call per guarded request. Use caching to mitigate.

## PrivilegeBoundary

Prevents privilege escalation: users cannot assign roles that exceed their own authority level.

```ts
import { PrivilegeBoundary, LeveledRole } from 'nestjs-boot';

const boundary = new PrivilegeBoundary([
  { name: 'SUPER_ADMIN', level: 100 },
  { name: 'ADMIN', level: 90 },
  { name: 'MANAGER', level: 70 },
  { name: 'STAFF', level: 20 },
  { name: 'USER', level: 10 },
]);

// Check before assigning
boundary.canAssignRole(['MANAGER'], 'STAFF');       // true  — 70 > 20
boundary.canAssignRole(['MANAGER'], 'ADMIN');        // false — 70 < 90
boundary.canAssignRole(['MANAGER'], 'MANAGER');      // false — 70 = 70 (not strictly greater)

// Enforce (throws ForbiddenException)
boundary.enforceAssignment(['MANAGER'], 'ADMIN');
// → ForbiddenException: Privilege boundary: cannot assign role "ADMIN" (level 90) — actor level is 70

// Check before modifying another user
boundary.canModifyUser(['ADMIN'], ['MANAGER']);       // true  — 90 > 70
boundary.canModifyUser(['MANAGER'], ['ADMIN']);        // false — 70 < 90
boundary.enforceModification(['MANAGER'], ['ADMIN']); // throws
```

`PrivilegeBoundary` is used by `RoleManager` automatically when provided.

## RoleManager

Manages the lifecycle of roles, permissions, and user-role assignments. Uses `PermissionStore` for persistence and `PrivilegeBoundary` for enforcement.

### Seeding roles and permissions

```ts
import { RoleManager } from 'nestjs-boot';

const manager = new RoleManager(permissionStore, privilegeBoundary);

manager.seed(
  [
    { code: 'ADMIN', name: 'Administrator', level: 90, isSystem: true, permissions: ['user:*'] },
    { code: 'STAFF', name: 'Staff', level: 20, isSystem: true, permissions: ['user:read'] },
  ],
  [
    { code: 'user:read', name: 'Read Users', resource: 'user', action: 'read' },
    { code: 'user:write', name: 'Write Users', resource: 'user', action: 'write' },
  ],
);
// Idempotent — skips roles/permissions that already exist
```

### CRUD operations

```ts
// Roles
manager.createRole({ code: 'EDITOR', name: 'Editor', level: 30, permissions: [] });
manager.getRole('EDITOR');
manager.listRoles();           // sorted by level descending
manager.updateRole('EDITOR', { level: 35 });
manager.deleteRole('EDITOR');  // throws if isSystem: true

// Permissions
manager.createPermission({ code: 'post:publish', name: 'Publish Posts', resource: 'post', action: 'publish' });
manager.listPermissions();

// Role-permission assignments
manager.assignPermissionToRole('EDITOR', 'post:publish');
manager.removePermissionFromRole('EDITOR', 'post:publish');
manager.getRolePermissions('EDITOR');
```

### System role protection

Roles with `isSystem: true` cannot be deleted or renamed:

```ts
manager.deleteRole('ADMIN'); // throws ConflictException: Cannot delete a system role
manager.updateRole('ADMIN', { code: 'SUPERUSER' }); // throws: Cannot rename a system role
```

### User-role assignment with privilege boundary

```ts
// actorRoles is optional — if provided, privilege boundary is enforced
await manager.assignRoleToUser('user-123', 'STAFF', ['ADMIN']); // OK — admin level > staff level
await manager.assignRoleToUser('user-123', 'ADMIN', ['STAFF']); // throws ForbiddenException
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

## Best Practices

1. **Enable `denyByDefault: true` in production** — forces explicit authorization on every route.
2. **Include roles/permissions in the JWT payload** at sign time. This avoids a database lookup on every request.
3. **Use permissions for fine-grained control** (`product:read`, `product:write`) and roles for coarse grouping (`admin`, `manager`).
4. **Keep role/permission strings lowercase and namespaced** (e.g. `order:cancel`, `report:export`).
5. **Define a role hierarchy** — avoids duplicating permission assignments across roles.
6. **Use `PrivilegeBoundary`** for any user-facing role management UI — prevents privilege escalation.
7. **Test both positive and negative cases.** Verify that a user without the required role/permission receives a 403.

## Common Pitfalls

- **Forgetting `denyByDefault` is off** — Without it, undecorated routes are open to any authenticated user. Audit routes regularly or enable `denyByDefault`.
- **Roles in JWT not refreshed** — Changing a user's roles in the database does not affect existing JWTs. Use short access token TTLs or implement `isRevoked`.
- **`@Permissions()` requires ALL, `@Roles()` requires ANY** — This asymmetry is intentional but often confused. `@Roles('admin', 'manager')` = OR; `@Permissions('read', 'write')` = AND.
- **Hierarchy direction** — `inherits` means "also has capabilities of" (downward). `ADMIN` inheriting `MANAGER` means admin can do everything manager can. Not the reverse.
- **`canAssignRole` uses strict greater-than** — A manager (level 70) cannot assign the manager role (level 70). Only roles with strictly lower levels.

## See also

- [Authentication](authentication.md) — JWT setup that feeds into RBAC guards
- [Authorization Decision Guide](authorization-decision-guide.md) — when to use Roles vs Permissions vs Policy
- [Scope Authorization](scope-authorization.md) — data-level access control
- [Multi-Tenant Organizations](multi-tenant-organizations.md) — org hierarchy wiring
- [User Management](user-management.md) — template CRUD with RBAC
- [Testing Guide](testing-guide.md) — `createTestJwt` with roles/permissions for testing guards
