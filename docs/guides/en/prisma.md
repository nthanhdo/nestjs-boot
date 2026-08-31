# Prisma

> **TL;DR** — Register `PrismaModule.register()` for single-schema or `MultiSchemaModule.register()` for multi-schema. Extend `PrismaBaseRepository` for type-safe CRUD with pagination. Use `prisma migrate` for migrations (not the framework's `MigrationRunner`, which is Mongoose-only).

## Setup

### PrismaModule (single schema)

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from 'nestjs-boot';

@Module({
  imports: [
    PrismaModule.register({
      url: process.env.DATABASE_URL,
      log: ['warn', 'error'],
    }),
  ],
})
export class AppModule {}
```

`PrismaModule.register()` is `@Global()` — `PrismaService` is available everywhere without re-importing.

### PrismaModuleOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | — | Database URL. Falls back to `DATABASE_URL` in your Prisma schema |
| `log` | `string[]` | `['warn', 'error']` | Prisma log levels: `'query'`, `'info'`, `'warn'`, `'error'` |

### Standalone usage (without BootOptions)

`PrismaModule.register()` is a standalone NestJS dynamic module. It does not require `createApp()` or `BootOptions`. Import it in any NestJS project:

```ts
// main.ts — standard NestJS bootstrap
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

## PrismaService

`PrismaService` wraps Prisma Client with lifecycle hooks:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-boot';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.client.product.findMany();
  }

  async create(data: { name: string; price: number }) {
    return this.prisma.client.product.create({ data });
  }
}
```

Key properties:

| Property / Method | Description |
|---|---|
| `client` | The underlying `PrismaClient` instance (lazy-initialized) |
| `$transaction(fn)` | Run operations in an interactive transaction |
| `onModuleInit()` | Connects automatically when the module starts |
| `onModuleDestroy()` | Disconnects automatically on shutdown |

## PrismaBaseRepository

Generic repository implementing `IRepository<T>` — the same interface as `BaseRepository` (Mongoose). This lets you swap ORMs without changing service code.

```ts
import { Injectable } from '@nestjs/common';
import { PrismaBaseRepository, PrismaService } from 'nestjs-boot';

interface Product {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class ProductRepository extends PrismaBaseRepository<Product> {
  constructor(prisma: PrismaService) {
    super(prisma, 'product'); // 'product' = Prisma model name (lowercase)
  }

  // Optional: override for full type safety
  protected get model() {
    return this.prisma.client.product;
  }
}
```

### API

| Method | Signature | Description |
|--------|-----------|-------------|
| `findById` | `findById(id: string): Promise<T \| null>` | Find by primary key |
| `findOne` | `findOne(where): Promise<T \| null>` | Find first matching record |
| `findMany` | `findMany(where, options?): Promise<PaginatedResult<T>>` | Paginated query (IRepository contract) |
| `findWithPagination` | `findWithPagination(where, options): Promise<PrismaPaginatedResult<T>>` | Paginated query (Prisma-native sort format) |
| `findManyRaw` | `findManyRaw(where?, options?): Promise<T[]>` | Raw findMany without pagination wrapper |
| `create` | `create(data): Promise<T>` | Create one record |
| `createMany` | `createMany(data[]): Promise<T[]>` | Create multiple (returns full records via transaction) |
| `createManyBulk` | `createManyBulk(data[]): Promise<{ count }>` | Bulk create (returns count only, faster) |
| `update` | `update(id, data): Promise<T \| null>` | Update by ID (returns null if not found) |
| `updateMany` | `updateMany(where, data): Promise<{ count }>` | Update multiple records |
| `delete` | `delete(id): Promise<T \| null>` | Delete by ID (returns null if not found) |
| `deleteMany` | `deleteMany(where): Promise<{ count }>` | Delete multiple records |
| `count` | `count(where?): Promise<number>` | Count matching records |
| `exists` | `exists(where): Promise<boolean>` | Check if any record matches |
| `upsert` | `upsert(where, create, update): Promise<T>` | Create or update |
| `withTransaction` | `withTransaction(fn): Promise<R>` | Run operations in a transaction |

### When to use raw client vs PrismaBaseRepository

| Use case | Approach |
|---|---|
| Standard CRUD with pagination | `PrismaBaseRepository` — less boilerplate |
| Complex queries with `include`, `select`, nested writes | Raw `this.prisma.client.model.*` — full Prisma type safety |
| Shared service interface (swap Mongoose/Prisma) | `PrismaBaseRepository` — implements `IRepository<T>` |
| One-off scripts, seeds | Raw `PrismaClient` directly |

## Multi-schema: SchemaRegistry + MultiSchemaModule

For PostgreSQL multi-schema architectures (e.g., separating `masterdata`, `userdata`, `analytics` into different schemas):

```ts
import { MultiSchemaModule } from 'nestjs-boot';

@Module({
  imports: [
    MultiSchemaModule.register({
      url: process.env.DATABASE_URL,
      schemas: {
        overrides: {
          // Override default schema assignments
          custom_table: 'analytics',
        },
      },
      autoCreateSchemas: true, // CREATE SCHEMA IF NOT EXISTS on init
    }),
  ],
})
export class AppModule {}
```

### Default schema assignments

`SchemaRegistry` ships with sensible defaults:

| Schema | Tables |
|---|---|
| `masterdata` | roles, permissions, role_permissions, role_hierarchy, organizations, departments, teams |
| `metadata` | permission_definitions, scope_definitions, policy_definitions |
| `userdata` | users, user_roles, user_permissions, user_org_memberships, refresh_tokens, sessions |
| `analytics` | audit_entries, security_events, login_attempts |
| `statistics` | access_stats, permission_usage, scope_hits, policy_evaluations |
| `public` | Everything else (default) |

### Using SchemaRegistry in repositories

```ts
import { Injectable } from '@nestjs/common';
import { PrismaBaseRepository, PrismaService, SchemaRegistry, SCHEMA_REGISTRY } from 'nestjs-boot';
import { Inject } from '@nestjs/common';

@Injectable()
export class UserRepository extends PrismaBaseRepository<User> {
  constructor(
    prisma: PrismaService,
    @Inject(SCHEMA_REGISTRY) registry: SchemaRegistry,
  ) {
    super(prisma, 'user', registry);
  }
}

// In your service:
console.log(userRepo.schema);        // 'userdata'
console.log(userRepo.qualifiedName); // 'userdata.user'
```

### Generating Prisma schema annotations

```ts
const registry = new SchemaRegistry();
console.log(registry.generatePrismaSchemaMap());
// Output: model-to-schema mapping for your schema.prisma file
// e.g. users → @@schema("userdata")
```

In your `prisma/schema.prisma`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "masterdata", "metadata", "userdata", "analytics", "statistics"]
}

model User {
  id    String @id @default(uuid())
  email String @unique
  name  String?
  @@map("users")
  @@schema("userdata")
}
```

## PrismaCrudService with lifecycle hooks

The Backend Core template demonstrates a service pattern with lifecycle hooks using `PrismaService` directly:

```ts
@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    // Pre-create hook
    this.validateBusinessRules(dto);

    const product = await this.prisma.client.product.create({
      data: { ...dto },
    });

    // Post-create hook
    await this.audit.log('product.created', product.id);

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    // Pre-update hook
    const existing = await this.prisma.client.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.client.product.update({
      where: { id },
      data: dto,
    });

    // Post-update hook
    await this.audit.log('product.updated', id, { changes: dto });

    return updated;
  }
}
```

For standardized CRUD with hooks, extend `PrismaBaseRepository` and override methods:

```ts
@Injectable()
export class AuditedProductRepository extends PrismaBaseRepository<Product> {
  constructor(prisma: PrismaService, private readonly audit: AuditService) {
    super(prisma, 'product');
  }

  async create(data: Partial<Product>): Promise<Product> {
    const result = await super.create(data);
    await this.audit.log('product.created', result.id);
    return result;
  }
}
```

## Migrations

**Use `prisma migrate` for Prisma projects** — not the framework's `MigrationRunner` (which is Mongoose-specific).

```bash
# Development — create and apply migrations
npx prisma migrate dev --name add-products-table

# Production — apply pending migrations
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Reset database (destructive)
npx prisma migrate reset
```

The framework's `MigrationModule` and `MigrationRunner` operate on raw MongoDB connections. They are not compatible with Prisma's migration system.

## Testing with mocks

### Mock PrismaService

```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from 'nestjs-boot';

const mockPrismaService = {
  client: {
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) => ({ id: 'test-id', ...args.data })),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
  },
  $transaction: jest.fn((fn) => fn(mockPrismaService.client)),
};

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(ProductService);
  });

  it('should create a product', async () => {
    const result = await service.create({ name: 'Widget', price: 9.99 });
    expect(result.id).toBe('test-id');
    expect(mockPrismaService.client.product.create).toHaveBeenCalledWith({
      data: { name: 'Widget', price: 9.99 },
    });
  });
});
```

### Mock PrismaBaseRepository

```ts
const mockRepo = {
  findById: jest.fn(),
  findMany: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  exists: jest.fn().mockResolvedValue(false),
};
```

## Best practices

1. **Use `PrismaBaseRepository` for shared interfaces** — when services might switch between Mongoose and Prisma, the `IRepository<T>` contract keeps service code ORM-agnostic.
2. **Use raw client for complex queries** — Prisma's generated types for `include`, `select`, and nested writes are lost when going through `PrismaBaseRepository`. Use `this.prisma.client.model.*` directly for complex relational queries.
3. **Prefer `createManyBulk` for large inserts** — `createMany` wraps individual creates in a transaction (to return full records). `createManyBulk` uses Prisma's native `createMany` for better performance when you only need the count.
4. **Use `MultiSchemaModule` for PostgreSQL** — it auto-creates schemas and provides the `SchemaRegistry` for entity routing. Single-schema apps should use `PrismaModule.register()`.

## Common pitfalls

- **`MigrationRunner` is Mongoose-only** — Do not try to use `MigrationModule` with Prisma. Use `prisma migrate` instead.
- **Model name casing** — Pass the lowercase model name to `PrismaBaseRepository` constructor (e.g., `'user'` not `'User'`). This must match the property name on the PrismaClient instance.
- **`createMany` vs `createManyBulk`** — `createMany` returns full records but is slower (N individual creates in a transaction). `createManyBulk` returns `{ count }` only but uses native batch insert.

## See also

- [Database](database.md) — Mongoose-based `BaseRepository`, `UnitOfWork`, `MigrationModule`
- [Multi-Tenancy](multi-tenancy.md) — tenant-scoped repositories
- [Testing Guide](testing-guide.md) — test utilities and patterns
