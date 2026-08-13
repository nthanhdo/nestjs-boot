# Database

> **TL;DR** — Config-driven MongoDB with automatic reader/writer split. Use `BaseRepository` for CRUD with pagination, `CachedBaseRepository` for cache-aside, `Specification` for composable queries, `UnitOfWork` for transactions, and `MigrationModule` for schema migrations.

## Overview

The `DatabaseModule` provides config-driven MongoDB with multi-connection support and automatic reader/writer split. Built on `@nestjs/mongoose` and Mongoose.

## Setup

### Single connection

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: 'mongodb://localhost:27017/myapp',
      },
    },
  },
});
```

### Reader/writer split

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: 'mongodb://primary:27017/myapp',
        readerUri: 'mongodb://secondary:27017/myapp',
        options: {
          maxPoolSize: 20,
          minPoolSize: 5,
          retryWrites: true,
        },
      },
    },
  },
});
```

When `readerUri` is provided, all read operations (`find`, `count`, `aggregate`, `exists`) automatically route to the reader connection. All writes always go to the writer.

### Multiple connections

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: { writerUri: 'mongodb://localhost:27017/myapp' },
      analytics: { writerUri: 'mongodb://localhost:27017/analytics' },
      logs: { writerUri: 'mongodb://localhost:27017/logs' },
    },
  },
});
```

### Connection options

| Option | Type | Description |
|--------|------|-------------|
| `writerUri` | `string` | Primary MongoDB URI (required) |
| `readerUri` | `string` | Read-replica URI (optional) |
| `options.maxPoolSize` | `number` | Maximum connection pool size |
| `options.minPoolSize` | `number` | Minimum connection pool size |
| `options.serverSelectionTimeoutMS` | `number` | Server selection timeout |
| `options.socketTimeoutMS` | `number` | Socket timeout |
| `options.connectTimeoutMS` | `number` | Connection timeout |
| `options.retryWrites` | `boolean` | Enable retryable writes |
| `options.retryReads` | `boolean` | Enable retryable reads |
| `options.replicaSet` | `string` | Replica set name |
| `options.readPreference` | `string` | Read preference |
| `options.ssl` | `boolean` | Enable SSL |
| `options.authSource` | `string` | Auth database |

## Registering schemas

Use `DatabaseModule.forFeature()` to register Mongoose schemas on a named connection. Schemas are automatically registered on both writer and reader connections.

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: Product.name, schema: ProductSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
})
export class ProductModule {}
```

Throws if the connection name was not registered via `DatabaseModule.register()`.

## BaseRepository

Generic repository with automatic reader/writer routing.

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'nestjs-boot';

@Injectable()
export class ProductRepository extends BaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name) writerModel: Model<ProductDocument>,
    // Inject reader model if reader/writer split is configured
  ) {
    super(writerModel);
  }
}
```

### API

| Method | Signature | Routes to |
|--------|-----------|-----------|
| `findAll` | `findAll(filter?, options?): Promise<PaginatedResult<T>>` | Reader |
| `findById` | `findById(id: string): Promise<T \| null>` | Reader |
| `findOne` | `findOne(filter): Promise<T \| null>` | Reader |
| `count` | `count(filter?): Promise<number>` | Reader |
| `exists` | `exists(filter): Promise<boolean>` | Reader |
| `aggregate` | `aggregate(pipeline): Promise<unknown[]>` | Reader |
| `create` | `create(data): Promise<T>` | Writer |
| `createMany` | `createMany(data[]): Promise<T[]>` | Writer |
| `update` | `update(id, data): Promise<T \| null>` | Writer |
| `updateMany` | `updateMany(filter, data): Promise<{ modifiedCount }>` | Writer |
| `delete` | `delete(id): Promise<T \| null>` | Writer |
| `deleteMany` | `deleteMany(filter): Promise<{ deletedCount }>` | Writer |

### FindAllOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `page` | `number` | 1 | Page number (1-based) |
| `limit` | `number` | 20 | Items per page |
| `sort` | `Record<string, 1 \| -1>` | — | Sort fields |
| `select` | `string \| Record<string, 0 \| 1>` | — | Field projection |

```ts
const result = await productRepo.findAll(
  { isActive: true },
  { page: 2, limit: 10, sort: { createdAt: -1 }, select: 'name price' },
);
// result: { data: Product[], total: number, page: 2, limit: 10 }
```

## CachedBaseRepository

Extends `BaseRepository` with automatic cache-aside. Read methods check cache first (MD5-keyed by collection + method + args). Write methods invalidate cache by collection prefix.

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CachedBaseRepository, MultiCacheService } from 'nestjs-boot';

@Injectable()
export class ProductRepository extends CachedBaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name) writerModel: Model<ProductDocument>,
    cacheService: MultiCacheService,
  ) {
    super(writerModel, undefined, cacheService, 600); // 600s TTL
  }
}
```

Cache keys follow the pattern `{collectionName}:{method}:{md5(args)}`. All writes (`create`, `update`, `delete`, etc.) call `delByPrefix(collectionName)` to invalidate the entire collection cache.

## Specification pattern

Composable, reusable query filters using the Specification pattern. Each specification produces a Mongoose `FilterQuery`.

```ts
import { Specification } from 'nestjs-boot';
import { FilterQuery } from 'mongoose';

class IsActiveSpec extends Specification<Product> {
  toFilter(): FilterQuery<Product> {
    return { isActive: true };
  }
}

class InCategorySpec extends Specification<Product> {
  constructor(private category: string) { super(); }
  toFilter(): FilterQuery<Product> {
    return { category: this.category };
  }
}

class PriceRangeSpec extends Specification<Product> {
  constructor(private min: number, private max: number) { super(); }
  toFilter(): FilterQuery<Product> {
    return { price: { $gte: this.min, $lte: this.max } };
  }
}

// Compose with and/or/not
const spec = new IsActiveSpec()
  .and(new InCategorySpec('electronics'))
  .and(new PriceRangeSpec(10, 100));

const results = await repo.findAll(spec.toFilter());
```

### Operators

| Method | Mongo operator | Description |
|--------|---------------|-------------|
| `and(other)` | `$and` | Both specs must match |
| `or(other)` | `$or` | Either spec must match |
| `not()` | `$nor` | Negates the spec |

## UnitOfWork

Wraps multiple repository operations in a MongoDB transaction. Requires a replica set.

```ts
import { Injectable } from '@nestjs/common';
import { UnitOfWork } from 'nestjs-boot';

@Injectable()
export class OrderService {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async placeOrder(data: CreateOrderDto) {
    return this.unitOfWork.execute(async (session) => {
      const order = await this.orderRepo.create(data, { session });
      await this.inventoryRepo.decrement(data.productId, data.qty, { session });
      await this.paymentRepo.charge(data.userId, data.total, { session });
      return order;
    });
    // All succeed or all rollback
  }
}
```

The `execute()` method starts a session, begins a transaction, runs your callback, commits on success, and aborts on error. The session is always ended in the `finally` block.

## Migrations

### Migration interface

```ts
import { Migration } from 'nestjs-boot';
import mongoose from 'mongoose';

const addEmailIndex: Migration = {
  version: '2026-08-07-001',
  name: 'add-email-index',
  async up(db: mongoose.Connection) {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
  },
  async down(db: mongoose.Connection) {
    await db.collection('users').dropIndex('email_1');
  },
};
```

Version format: date-prefixed (`2026-08-07-001`) or semantic (`1.0.0`). Migrations are sorted and executed in ascending version order.

### MigrationModule

```ts
import { MigrationModule } from 'nestjs-boot';
import { addEmailIndex } from './migrations/add-email-index';

@Module({
  imports: [
    MigrationModule.register({
      connection: 'master',
      migrations: [addEmailIndex],
      autoRun: false, // recommended — run via CLI instead
    }),
  ],
})
export class AppModule {}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connection` | `string` | — | Named connection from `DatabaseModule.register()` |
| `migrations` | `Migration[]` | — | Migration instances |
| `autoRun` | `boolean` | `false` | Run pending migrations on app start |

### MigrationRunner API

| Method | Signature | Description |
|--------|-----------|-------------|
| `migrate` | `migrate(): Promise<MigrationResult[]>` | Run all pending migrations |
| `rollback` | `rollback(count?: number): Promise<MigrationResult[]>` | Revert last N migrations (default 1) |
| `status` | `status(): Promise<MigrationStatus[]>` | List all migrations with applied/pending status |

Applied migrations are tracked in the `_migrations` collection. The runner stops on the first failure — later migrations may depend on the failed one.

## Best practices

- **Always use reader/writer split in production** — even if both point to the same URI initially. Adding a replica later requires zero code changes.
- **Use Specifications for complex queries** — compose reusable specs instead of building inline filter objects. Easier to test and maintain.
- **Prefer CachedBaseRepository for read-heavy collections** — automatic cache-aside with zero boilerplate.
- **Set `autoRun: false` for migrations** — run migrations explicitly via CLI or a startup script. Auto-running in production with multiple replicas can cause race conditions.
- **Use UnitOfWork for multi-document writes** — MongoDB transactions require a replica set. Configure one even in development.

## Common pitfalls

- **Standalone MongoDB + transactions** — `UnitOfWork.execute()` requires a replica set. Standalone MongoDB does not support multi-document transactions. Use `mongod --replSet rs0` in development.
- **Unknown connection name** — `DatabaseModule.forFeature('typo', [...])` throws immediately with the list of registered connections.
- **Cache invalidation scope** — `CachedBaseRepository` invalidates the entire collection prefix on any write. This is correct but aggressive. For fine-grained invalidation, use `TaggedCacheService` instead.
- **Migration `down()` missing** — `rollback()` skips migrations without a `down()` method (status: `skipped`). Always implement `down()` for reversible migrations.

## See also

- [Cache](cache.md) — multi-layer caching that pairs with `CachedBaseRepository`
- [Testing Guide](testing-guide.md) — in-memory MongoDB for tests via `createTestApp`
- [Multi-Tenancy](multi-tenancy.md) — `TenantAwareRepository` for auto-scoped queries
