# Scope API Reference

> Scope-based data access control — restricts what data a user can see/modify based on their access boundary (own → team → department → organization → system).

## Module Registration

```ts
ScopeModule.register(options?: ScopeModuleOptions): DynamicModule
```

`ScopeModule` is `global: true`. Registers `ScopeResolver` and `ScopeGuard` as global providers. Register once in your root `AppModule`.

```ts
import { ScopeModule } from '@nestjs-boot/scope';

ScopeModule.register({
  defaultScope: AccessScope.OWN,

  // Optional: override how scope context is extracted from the request
  extractContext: (req) => ({
    userId: req.user.id,
    organizationId: req.user.orgId,
    departmentId: req.user.deptId,
    teamId: req.user.teamId,
  }),

  // Optional: override how the user's maximum scope is determined
  resolveScope: (req) => req.user.scope ?? AccessScope.OWN,
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extractContext` | `(req) => ScopeContext \| Promise<ScopeContext>` | Reads `req.user` fields | Custom extractor for the current user's scope context |
| `resolveScope` | `(req) => AccessScope \| Promise<AccessScope>` | Reads `req.user.scope` | Custom resolver for the user's maximum allowed scope |
| `defaultScope` | `AccessScope` | `AccessScope.OWN` | Scope to use when `resolveScope` finds nothing |

---

## Enum

### `AccessScope`

Defines the data boundary a user can access. Ordered from most restrictive to least restrictive.

```ts
enum AccessScope {
  OWN          = 'OWN',          // Only resources owned by the current user
  TEAM         = 'TEAM',         // Resources belonging to the user's team
  DEPARTMENT   = 'DEPARTMENT',   // Resources belonging to the user's department
  ORGANIZATION = 'ORGANIZATION', // Resources belonging to the user's organization
  SYSTEM       = 'SYSTEM',       // Unrestricted system-wide access
}
```

---

## Constants

### `SCOPE_LEVELS`

Numeric levels for scope comparison. Higher value = broader access.

```ts
const SCOPE_LEVELS: Record<AccessScope, number> = {
  OWN:          10,
  TEAM:         20,
  DEPARTMENT:   30,
  ORGANIZATION: 40,
  SYSTEM:       50,
};
```

Used internally by `ScopeResolver.isScopeSufficient()`.

---

## Classes

### `ScopeResolver`

> Extracts scope context from requests, resolves user scope, and builds query filters.

Injectable via class token. Exported from `ScopeModule`.

#### Methods

##### `extractContext(request: any): Promise<ScopeContext>`

Extract the current user's organizational context from the request. Uses `options.extractContext` if provided; otherwise reads `req.user.sub`/`id`, `req.user.organizationId`, `req.user.departmentId`, `req.user.teamId`.

##### `resolveScope(request: any): Promise<AccessScope>`

Determine the user's maximum allowed scope. Uses `options.resolveScope` if provided; otherwise reads `req.user.scope`. Falls back to `defaultScope` (default: `AccessScope.OWN`).

##### `isScopeSufficient(userScope: AccessScope, requiredScope: AccessScope): boolean`

Returns `true` if `SCOPE_LEVELS[userScope] >= SCOPE_LEVELS[requiredScope]`.

```ts
resolver.isScopeSufficient(AccessScope.DEPARTMENT, AccessScope.TEAM); // true
resolver.isScopeSufficient(AccessScope.OWN, AccessScope.ORGANIZATION); // false
```

##### `buildScopeFilter(scope: AccessScope, context: ScopeContext): Record<string, any>`

Build a Mongoose/Prisma `where` filter object appropriate for the given scope. Useful for restricting data queries.

| Scope | Filter produced |
|-------|----------------|
| `OWN` | `{ ownerId: context.userId }` |
| `TEAM` | `{ teamId: context.teamId }` (falls back to `ownerId`) |
| `DEPARTMENT` | `{ departmentId: context.departmentId }` (falls back to `ownerId`) |
| `ORGANIZATION` | `{ organizationId: context.organizationId }` (falls back to `ownerId`) |
| `SYSTEM` | `{}` — no filter, full access |

```ts
const filter = resolver.buildScopeFilter(AccessScope.TEAM, ctx);
const records = await repo.findMany(filter);
```

---

### `ScopeGuard`

> Route guard that enforces `@RequireScope()` constraints.

Registered globally via `APP_GUARD` when `ScopeModule.register()` is called. Respects `@Public()` routes — if the route is public, the guard passes without checking scope.

Behavior:
- No `@RequireScope()` on handler/class → guard passes.
- User scope `<` required scope → `403 ForbiddenException`.
- User scope `>=` required scope → passes.

---

## Decorators

### `@RequireScope(scope: AccessScope)`

Attach to a controller method or controller class. The request's resolved scope must be at or above the specified level.

```ts
import { RequireScope, AccessScope } from '@nestjs-boot/scope';

@Controller('reports')
export class ReportController {
  @Get()
  @RequireScope(AccessScope.DEPARTMENT)
  findAll() { ... }

  @Get('system')
  @RequireScope(AccessScope.SYSTEM)
  findAllSystem() { ... }
}
```

---

## Interfaces

### `ScopeContext`

```ts
interface ScopeContext {
  userId: string;
  organizationId?: string;
  departmentId?: string;
  teamId?: string;
}
```

### `ScopeModuleOptions`

```ts
interface ScopeModuleOptions {
  extractContext?: (request: any) => ScopeContext | Promise<ScopeContext>;
  resolveScope?: (request: any) => AccessScope | Promise<AccessScope>;
  defaultScope?: AccessScope;
}
```

### `ScopeCheckResult`

Returned internally (not exposed by guards directly, but useful if using `ScopeResolver` manually):

```ts
interface ScopeCheckResult {
  allowed: boolean;
  userScope: AccessScope;
  requiredScope: AccessScope;
  context?: ScopeContext;
}
```

---

## Constants / Tokens

| Token | Value | Description |
|-------|-------|-------------|
| `SCOPE_KEY` | `'boot:scope'` | Metadata key set by `@RequireScope()` |
| `SCOPE_OPTIONS` | `'BOOT_SCOPE_OPTIONS'` | Injection token for `ScopeModuleOptions` |
