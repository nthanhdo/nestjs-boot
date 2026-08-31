# Tenancy API Reference

> Opt-in multi-tenancy support with three extraction strategies and three data isolation models.

## Module Registration

```ts
TenancyModule.register(options: TenancyOptions): DynamicModule
```

Registers `TenantMiddleware` on all routes (`*`), provides `TenantContext`, `TenantGuard`, and the active isolation strategy. Fully opt-in — has no effect on apps that don't configure it.

```ts
// In createApp() via BootOptions.tenancy, or directly in AppModule
TenancyModule.register({
  strategy: 'header',   // 'header' | 'subdomain' | 'path'
  isolation: 'row',     // 'row' | 'schema' | 'database'
})
```

Default `headerName`: `'X-Tenant-ID'`
Default `isolation`: `'row'`

The module is `@Global()` — `TenantContext` and `TenantGuard` are available everywhere without re-importing.

## Classes / Methods

### `TenantContext`

Injectable service that exposes the current tenant ID through AsyncLocalStorage.

```ts
class TenantContext {
  /**
   * Returns the tenant ID for the current async context.
   * Throws if no tenant context is active.
   */
  getTenantId(): string

  /**
   * Returns the tenant ID or undefined if no context is active.
   */
  getTenantIdOrUndefined(): string | undefined
}
```

```ts
@Injectable()
export class ProductService {
  constructor(private readonly tenantContext: TenantContext) {}

  findAll() {
    const tenantId = this.tenantContext.getTenantId();
    // ... query scoped to tenantId
  }
}
```

---

### `TenantMiddleware`

NestJS middleware that extracts the tenant ID from each request and stores it in `AsyncLocalStorage`. Applied automatically to all routes by `TenancyModule`.

```ts
class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void
}
```

Extraction order:
1. `options.resolver` (custom function) if provided
2. Built-in strategy: `'header'` | `'subdomain'` | `'path'`

Throws `UnauthorizedException` (401) if no tenant ID can be resolved.

---

### `TenantGuard`

NestJS guard that enforces tenant presence on routes decorated with `@TenantRequired()`. Throws `UnauthorizedException` if the active route requires a tenant but none is present.

```ts
class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean
}
```

Register globally:
```ts
providers: [{ provide: APP_GUARD, useClass: TenantGuard }]
```

---

### `TenantAwareRepository<T>`

Abstract base repository that auto-scopes all Mongoose operations by the current tenant ID (row-isolation model). Every method automatically adds `{ tenantId: currentTenantId }` to queries.

```ts
abstract class TenantAwareRepository<T> {
  constructor(
    protected readonly model: Model<T>,
    opts?: { requireTenant?: boolean },  // throw if no tenant context (default: warn + unscoped)
  )

  findAll(filter?: FilterQuery<T>): Promise<T[]>
  findOne(filter: FilterQuery<T>): Promise<T | null>
  findById(id: string): Promise<T | null>
  create(data: Partial<T>): Promise<T>
  updateMany(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<{ modifiedCount: number }>
  updateOne(filter: FilterQuery<T>, update: UpdateQuery<T>, options?: { new?: boolean }): Promise<T | null>
  deleteMany(filter?: FilterQuery<T>): Promise<{ deletedCount: number }>
  deleteOne(filter: FilterQuery<T>): Promise<boolean>
  count(filter?: FilterQuery<T>): Promise<number>
}
```

```ts
@Injectable()
export class ProductRepository extends TenantAwareRepository<Product> {
  constructor(@InjectModel(Product.name) model: Model<Product>) {
    super(model);
  }
}
```

If no tenant context is active (e.g. a background job), the repository logs a warning and returns unscoped results. Pass `{ requireTenant: true }` to throw instead.

---

### `RowIsolation`

Shared collections with `tenantId` field on every document. Default and simplest isolation model.

```ts
class RowIsolation {
  readonly type = 'row'

  getTenantFilter(tenantId: string): Record<string, string>  // { tenantId }
  getTenantFields(tenantId: string): Record<string, string>  // { tenantId }
}
```

Trade-offs:
- Zero infrastructure overhead
- Index design must include `tenantId` as leading key for compound indexes

---

### `SchemaIsolation`

Shared MongoDB database with collection-name prefix per tenant.

```ts
class SchemaIsolation {
  readonly type = 'schema'

  constructor(prefix?: string)  // default: 'tenant'

  /**
   * e.g. getCollectionName('orders', 'acme') → 'tenant_acme_orders'
   */
  getCollectionName(baseCollection: string, tenantId: string): string
}
```

---

### `DatabaseIsolation`

Separate MongoDB database per tenant.

> **Warning:** Each unique active tenant opens a new Mongoose connection pool. Unbounded in-memory cache — add LRU eviction in production.

```ts
class DatabaseIsolation {
  readonly type = 'database'
  readonly connectionCount: number  // number of open connections

  constructor(
    uriFactory: (tenantId: string) => string,  // returns the MongoDB URI for a tenant
  )

  getConnection(tenantId: string, mongoose: any): Promise<unknown>
  evict(tenantId: string): Promise<void>
}
```

Not auto-registered by `TenancyModule` (requires `uriFactory` arg). Instantiate directly:
```ts
new DatabaseIsolation((tenantId) => `mongodb://db-host/${tenantId}`)
```

---

### Standalone functions

```ts
/** Get the current tenant ID for the active async context (request). */
function getTenantId(): string | undefined

/** Run a callback within a tenant context. Used by TenantMiddleware. */
function runWithTenant<T>(tenantId: string, fn: () => T): T
```

## Decorators

### `@TenantRequired()`

```ts
const TenantRequired: () => MethodDecorator & ClassDecorator
```

Marks a route as requiring a valid tenant context. `TenantGuard` will reject (401) any request without a resolved tenant ID.

```ts
@Get()
@TenantRequired()
findAll() {}
```

---

### `@TenantScoped()`

```ts
const TenantScoped: () => MethodDecorator & ClassDecorator
```

Signals that queries on this route should be auto-filtered by `tenantId`. Primarily informational — `TenantAwareRepository` always auto-scopes when a tenant context is active.

---

### `@CurrentTenant()`

```ts
const CurrentTenant: ParameterDecorator
```

Parameter decorator that injects the current tenant ID into a route handler argument.

```ts
@Get()
findAll(@CurrentTenant() tenantId: string) { ... }
```

## Interfaces

### `TenancyOptions`

```ts
interface TenancyOptions {
  /**
   * Extraction strategy:
   * - 'header'    → reads headerName (default: X-Tenant-ID)
   * - 'subdomain' → reads first subdomain label (acme.api.example.com → 'acme')
   * - 'path'      → reads first path segment (/acme/products → 'acme')
   */
  strategy: 'header' | 'subdomain' | 'path';

  /** Header name for 'header' strategy. Default: 'X-Tenant-ID' */
  headerName?: string;

  /**
   * Custom resolver that overrides the built-in strategy.
   * Return null/undefined to signal "no tenant" (request rejected).
   */
  resolver?: (req: Request) => string | null | undefined;

  /**
   * Data isolation model:
   * - 'row'      → shared collections + tenantId field auto-filter (default)
   * - 'schema'   → shared DB, collection name prefix per tenant
   * - 'database' → separate MongoDB database per tenant (⚠️ connection overhead)
   */
  isolation: 'database' | 'schema' | 'row';
}
```

## Constants / Tokens

| Token | Value | Description |
|---|---|---|
| `TENANCY_OPTIONS` | `Symbol('TENANCY_OPTIONS')` | DI token for the resolved `TenancyOptions` |
| `TENANT_REQUIRED_KEY` | `'boot:tenant_required'` | Metadata key for `@TenantRequired` |
| `TENANT_SCOPED_KEY` | `'boot:tenant_scoped'` | Metadata key for `@TenantScoped` |
