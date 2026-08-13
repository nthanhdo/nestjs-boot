# Multi-Tenancy

nestjs-boot provides opt-in multi-tenancy with pluggable tenant extraction strategies, three data isolation models, and auto-scoped repositories. The module has zero effect on applications that do not configure it.

## Setup

```ts
import { TenancyModule } from 'nestjs-boot/tenancy';

@Module({
  imports: [
    TenancyModule.register({
      strategy: 'header',       // how to extract tenant ID
      headerName: 'X-Tenant-ID', // default for header strategy
      isolation: 'row',          // data isolation model
    }),
  ],
})
export class AppModule {}
```

The module registers middleware on all routes that extracts the tenant ID and stores it in AsyncLocalStorage for the duration of the request.

## Tenant Extraction Strategies

### Header (default)

Reads the tenant ID from a request header:

```ts
TenancyModule.register({
  strategy: 'header',
  headerName: 'X-Tenant-ID', // default
  isolation: 'row',
})
```

```bash
curl -H "X-Tenant-ID: acme" http://localhost:3000/products
```

### Subdomain

Extracts the first subdomain label:

```ts
TenancyModule.register({
  strategy: 'subdomain',
  isolation: 'row',
})
```

`acme.api.example.com` resolves to tenant `acme`. Hosts with fewer than 3 labels (e.g. `api.example.com`) resolve to no tenant and the request is rejected.

### Path

Reads the first URL path segment:

```ts
TenancyModule.register({
  strategy: 'path',
  isolation: 'row',
})
```

`/acme/products` resolves to tenant `acme`.

### Custom Resolver

Override built-in strategies with a function:

```ts
TenancyModule.register({
  strategy: 'header', // ignored when resolver is provided
  isolation: 'row',
  resolver: (req) => {
    // JWT-based tenant extraction
    const token = req.headers.authorization?.split(' ')[1];
    const payload = jwt.decode(token);
    return payload?.tenantId ?? null; // null = reject request
  },
})
```

Returning `null` or `undefined` from the resolver causes the middleware to reject the request with 401.

## Accessing the Tenant ID

### TenantContext Service

```ts
import { TenantContext } from 'nestjs-boot/tenancy';

@Injectable()
export class BillingService {
  constructor(private readonly tenantContext: TenantContext) {}

  async getBill() {
    const tenantId = this.tenantContext.getTenantId(); // throws if no context
    const maybeId = this.tenantContext.getTenantIdOrUndefined(); // safe version
    return this.repo.findBill(tenantId);
  }
}
```

### @CurrentTenant Param Decorator

```ts
import { CurrentTenant } from 'nestjs-boot/tenancy';

@Controller('products')
export class ProductController {
  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.productService.findAll(tenantId);
  }
}
```

### Standalone Function

For non-DI contexts (utilities, middleware):

```ts
import { getTenantId, runWithTenant } from 'nestjs-boot/tenancy';

// Read current tenant
const id = getTenantId(); // string | undefined

// Run code in a tenant context (background jobs, tests)
runWithTenant('acme', () => {
  // getTenantId() returns 'acme' here
  processJob();
});
```

## Data Isolation Strategies

### Row Isolation (default)

All tenants share the same MongoDB collections. Every document gets a `tenantId` field. Queries are automatically scoped.

```ts
TenancyModule.register({ strategy: 'header', isolation: 'row' })
```

Trade-offs: zero infrastructure overhead, easiest to reason about, cross-tenant analytics is straightforward. Compound indexes must include `tenantId` as a leading key.

### Schema Isolation

Shared database, but each tenant gets prefixed collections: `tenant_acme_products`, `tenant_acme_orders`.

```ts
TenancyModule.register({ strategy: 'header', isolation: 'schema' })
```

```ts
import { SchemaIsolation } from 'nestjs-boot/tenancy';

const schema = new SchemaIsolation('tenant'); // prefix
schema.getCollectionName('orders', 'acme'); // 'tenant_acme_orders'
```

Trade-offs: stronger logical isolation, shared connection pool, easy per-tenant backup. Collection count grows with tenants x models.

### Database Isolation

Each tenant gets a separate MongoDB database. Use for regulatory/compliance requirements.

```ts
import { DatabaseIsolation } from 'nestjs-boot/tenancy';

const isolation = new DatabaseIsolation(
  (tenantId) => `mongodb://localhost:27017/app_${tenantId}`,
);

// Get or lazily create a connection
const conn = await isolation.getConnection('acme', mongoose);

// Evict idle connections
await isolation.evict('acme');

// Monitor connection count
console.log(isolation.connectionCount);
```

DatabaseIsolation is not auto-registered by TenancyModule because it requires a `uriFactory`. Instantiate it directly.

Warning: each tenant opens a separate connection pool. Atlas M10 supports ~500 connections; with default pool sizes, this limits you to ~250 concurrent tenants. Implement LRU eviction for production use.

## TenantAwareRepository

Wraps a Mongoose model to auto-scope all CRUD operations by tenant:

```ts
import { TenantAwareRepository } from 'nestjs-boot/tenancy';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class ProductRepository extends TenantAwareRepository<Product> {
  constructor(@InjectModel(Product.name) model: Model<Product>) {
    super(model);
    // Or: super(model, { requireTenant: true }) to throw instead of warn
  }
}
```

All methods auto-inject `{ tenantId }`:

```ts
// These are all scoped to the current tenant automatically:
await repo.findAll({ status: 'active' });
await repo.findOne({ sku: 'ABC' });
await repo.findById('507f1f77bcf86cd799439011');
await repo.create({ name: 'Widget', price: 9.99 });
await repo.updateOne({ sku: 'ABC' }, { $set: { price: 12.99 } });
await repo.updateMany({ status: 'draft' }, { $set: { status: 'active' } });
await repo.deleteOne({ sku: 'ABC' });
await repo.deleteMany({ status: 'archived' });
await repo.count({ status: 'active' });
```

If no tenant context is active (e.g., a background job), the repository logs a warning and runs unscoped. Pass `{ requireTenant: true }` to throw instead.

## TenantGuard and @TenantRequired

Enforce that certain routes require a valid tenant context:

```ts
import { TenantGuard, TenantRequired } from 'nestjs-boot/tenancy';

// Register globally
app.useGlobalGuards(app.get(TenantGuard));

@Controller('products')
export class ProductController {
  @Get()
  @TenantRequired() // returns 401 if no tenant ID resolved
  findAll() { ... }

  @Get('public-catalog')
  // No @TenantRequired — accessible without tenant header
  getPublicCatalog() { ... }
}
```

The `@TenantScoped()` decorator is informational, signaling that a route's queries are tenant-scoped via the repository layer.

## Best Practices

- Start with row isolation. It covers most SaaS use cases with minimal complexity. Migrate to schema or database isolation only when compliance requirements demand it.
- Always add a compound index with `tenantId` as the leading key for row-isolated collections: `{ tenantId: 1, status: 1, createdAt: -1 }`.
- Use `{ requireTenant: true }` on repositories in tenant-critical paths (billing, user data) to fail fast instead of silently returning cross-tenant data.
- For background jobs, wrap processing in `runWithTenant(tenantId, fn)` to establish the tenant context outside of HTTP middleware.
- Test tenant isolation rigorously. A filter bug in row isolation can expose data across tenants. Write tests that create data for tenant A and assert tenant B cannot read it.
- Use `@TenantRequired()` on all tenant-specific routes and leave public endpoints (health checks, landing pages) undecorated.
