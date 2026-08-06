# nestjs-boot

> Multi-database connections. Reader/writer split. Multi-layer cache.
> One config object. Zero wiring.

[![npm version](https://img.shields.io/npm/v/nestjs-boot.svg)](https://www.npmjs.com/package/nestjs-boot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/nthanhdo/nestjs-boot/actions/workflows/ci.yml/badge.svg)](https://github.com/nthanhdo/nestjs-boot/actions/workflows/ci.yml)

## Why

Every new NestJS project starts the same way: copy-paste 2,500+ lines of infrastructure setup. MongoDB connections, Redis cache, response envelope, health checks, error filters, config validation. Eight modules. Ten imports. Fifty lines of wiring. Every. Single. Time.

`nestjs-boot` compresses all of that into a single config object.

## Before / After

**Before** -- manual wiring across multiple files:

```ts
// main.ts — 47 lines just to wire infrastructure
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// app.module.ts
@Module({
  imports: [
    MongooseModule.forRootAsync({
      connectionName: 'master_writer',
      useFactory: () => ({ uri: process.env.MONGO_MASTER_URI }),
    }),
    MongooseModule.forRootAsync({
      connectionName: 'master_reader',
      useFactory: () => ({ uri: process.env.MONGO_MASTER_READER_URI }),
    }),
    MongooseModule.forRootAsync({
      connectionName: 'analytics',
      useFactory: () => ({ uri: process.env.MONGO_ANALYTICS_URI }),
    }),
    CacheModule.register({ store: redisStore, url: process.env.REDIS_URL }),
    ConfigModule.forRoot({ validationSchema: Joi.object({ ... }) }),
    TerminusModule.forRoot(),
    // ... ResponseInterceptor, AllExceptionsFilter, health indicators ...
  ],
})
export class AppModule {}
```

**After** -- one config object:

```ts
// main.ts — that's it
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

const app = await createApp(AppModule, {
  database: {
    connections: {
      master: { writerUri: process.env.MONGO_URI, readerUri: process.env.MONGO_READER_URI },
      analytics: { writerUri: process.env.MONGO_ANALYTICS_URI },
    },
  },
  cache: { redis: { url: process.env.REDIS_URL } },
  health: { enabled: true },
});

await app.listen(3000);
```

Your `AppModule` stays clean -- just your business logic.

## Features nobody else has

These are the features that don't exist in any other NestJS package or boilerplate:

### Multi-database connections

Declare N named MongoDB connections in config. Each gets auto-wired with its own injection tokens. No manual `forRootAsync()` calls.

```ts
database: {
  connections: {
    master: { writerUri: '...' },
    analytics: { writerUri: '...' },
    logs: { writerUri: '...' },
  },
}
```

### Reader/writer split

Add a `readerUri` to any connection. Reads auto-route to the replica, writes always go to the primary. Zero application code changes.

```ts
master: {
  writerUri: 'mongodb://primary:27017/app',
  readerUri: 'mongodb://replica:27017/app',
}
```

The `BaseRepository` handles routing transparently -- all read methods (`findAll`, `findById`, `findOne`, `count`, `aggregate`, `exists`) use the reader connection when available.

### Multi-layer cache (L1 + L2)

In-memory L1 with Redis L2. Read path: L1 miss -> L2 hit -> write-back to L1. Size-aware routing: values under 1MB go to both layers, larger values go to L2 only (no L1 memory pressure).

```ts
cache: {
  redis: { url: 'redis://localhost:6379' },     // L2
  memcached: { url: 'localhost:11211' },         // L1 (optional -- falls back to in-memory LRU)
  defaultTtl: 300,
}
```

## Also included

- **Config** -- Joi validation on boot, typed access via `BootConfigService.get('database.connections.master.writerUri')`
- **Response envelope** -- unified `{ data, message, statusCode, total, page, limit }` format, opt-in (`response: { envelope: true }`)
- **Health checks** -- auto-detects configured drivers (MongoDB, Redis) and exposes `/health`
- **Error filter** -- global catch-all exception filter with structured error responses (on by default)
- **Base repository** -- generic CRUD + pagination + aggregation pipeline, with reader/writer awareness built in

## Install

```bash
npm install nestjs-boot
```

Peer dependencies (you probably already have these):

```bash
npm install @nestjs/common @nestjs/core mongoose rxjs
```

Optional (for cache):

```bash
npm install ioredis    # Redis L2 cache
npm install memjs      # Memcached L1 cache (otherwise uses in-memory LRU)
```

## Quick Start

```ts
// main.ts
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {
    database: {
      connections: {
        master: { writerUri: process.env.MONGO_URI },
      },
    },
  });

  await app.listen(3000);
}

bootstrap();
```

That gives you: validated config, MongoDB connection, health endpoint at `/health`, and global error handling. Add sections to the config object to enable more modules.

## Modules

### Database

Config-driven multi-connection MongoDB with automatic reader/writer split.

```ts
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: process.env.MONGO_MASTER_URI,
        readerUri: process.env.MONGO_MASTER_READER_URI, // optional
      },
      analytics: {
        writerUri: process.env.MONGO_ANALYTICS_URI,
      },
    },
  },
});
```

Access raw connections with `@InjectConnection`:

```ts
import { InjectConnection } from 'nestjs-boot';
import { Connection } from 'mongoose';

@Injectable()
export class MigrationService {
  constructor(
    @InjectConnection('master', 'writer') private readonly writer: Connection,
    @InjectConnection('master', 'reader') private readonly reader: Connection,
  ) {}
}
```

### Cache

Multi-layer cache with cache-aside pattern and per-layer TTL control.

```ts
import { Injectable } from '@nestjs/common';
import { InjectCache, MultiCacheService } from 'nestjs-boot';

@Injectable()
export class PriceService {
  constructor(@InjectCache() private readonly cache: MultiCacheService) {}

  async getPrice(productId: string): Promise<number> {
    return this.cache.getOrSet(
      `price:${productId}`,
      () => this.fetchFromApi(productId),
      { ttl: 60, l2Ttl: 300 }, // L1: 1 min, L2: 5 min
    );
  }

  async invalidateAll(): Promise<void> {
    await this.cache.delByPrefix('price:'); // deletes across all layers
  }
}
```

The `MultiCacheService` API:

| Method | Description |
|--------|-------------|
| `get<T>(key)` | L1 -> L2 -> undefined. Writes back to L1 on L2 hit. |
| `set(key, value, opts?)` | Size-aware write to L1 + L2. `opts: { ttl, l2Ttl }` |
| `del(key)` | Delete from all layers |
| `delByPrefix(prefix)` | Prefix deletion across all layers |
| `getOrSet<T>(key, factory, opts?)` | Cache-aside: return cached or call factory and cache result |
| `has(key)` | Check existence in any layer |

### Repository

`BaseRepository<T>` provides generic CRUD with automatic reader/writer routing. All read operations use the reader connection (if configured), all writes go to the writer.

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository, BaseRepository } from 'nestjs-boot';
import { ProductDocument } from './product.schema';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository('Product', 'master')
    private readonly repo: BaseRepository<ProductDocument>,
  ) {}

  async list(page: number, limit: number) {
    return this.repo.findAll({}, { page, limit, sort: { createdAt: -1 } });
    // Returns: { data: Product[], total: number, page: number, limit: number }
  }

  async getById(id: string) {
    return this.repo.findById(id);
  }

  async create(data: Partial<ProductDocument>) {
    return this.repo.create(data); // always writes to primary
  }
}
```

`BaseRepository` methods: `findAll`, `findById`, `findOne`, `create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `count`, `aggregate`, `exists`.

#### CachedBaseRepository

Extends `BaseRepository` with automatic cache-aside. Reads check cache first (key = MD5 of collection + method + args). Writes invalidate the collection's cache prefix.

```ts
import { CachedBaseRepository } from 'nestjs-boot';

@Injectable()
export class CachedProductService {
  constructor(
    @InjectRepository('Product', 'master')
    private readonly repo: CachedBaseRepository<ProductDocument>,
  ) {}

  async getById(id: string) {
    return this.repo.findById(id);
    // First call: DB query + cache write
    // Subsequent calls: L1 -> L2 -> DB (cache-aside, automatic)
  }

  async update(id: string, data: Partial<ProductDocument>) {
    return this.repo.update(id, data);
    // Writes to DB + invalidates all cached entries for this collection
  }
}
```

### Config

Typed access to the validated boot config from anywhere in your app.

```ts
import { Injectable } from '@nestjs/common';
import { BootConfigService } from 'nestjs-boot';

@Injectable()
export class SomeService {
  constructor(private readonly config: BootConfigService) {}

  doSomething() {
    const uri = this.config.get<string>('database.connections.master.writerUri');
    const ttl = this.config.get<number>('cache.defaultTtl');

    // Or throw if missing:
    const redisUrl = this.config.getOrThrow<string>('cache.redis.url');

    // Full config object:
    const all = this.config.getAll();
  }
}
```

### Response Envelope

Opt-in unified response format. Default is **off** -- enable it explicitly.

```ts
const app = await createApp(AppModule, {
  response: {
    envelope: true,     // wraps all responses in { data, message, statusCode }
    errorHandler: true, // global exception filter (default: true)
  },
});
```

Success response:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { "id": "123", "name": "Widget" },
  "total": 42,
  "page": 1,
  "limit": 20
}
```

Error response:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "BadRequestException",
  "timestamp": "2026-08-06T10:00:00.000Z",
  "path": "/api/products"
}
```

### Health

Auto-detects configured drivers and registers health indicators. No manual wiring.

```ts
const app = await createApp(AppModule, {
  database: { connections: { master: { writerUri: '...' } } },
  cache: { redis: { url: '...' } },
  health: { enabled: true, path: '/health' }, // defaults
});
```

`GET /health` returns status for each configured driver (MongoDB connections, Redis).

## Recommended companions

We don't wrap what's already great.

- **Logging:** [nestjs-pino](https://github.com/iamolegga/nestjs-pino) -- structured logging done right (2.4M downloads/week)
- **Auth:** [@nestjs/jwt](https://github.com/nestjs/jwt) + [@nestjs/passport](https://github.com/nestjs/passport) -- until nestjs-boot v0.2.0 ships a composable auth kit
- **Queue:** [@nestjs/bullmq](https://github.com/nestjs/bull) -- BullMQ integration

## Roadmap

- [ ] **v0.2.0** -- Auth Kit: JWT guard + API Key guard (composable, no forced user model)
- [ ] **v0.2.0** -- Prometheus metrics + graceful shutdown
- [ ] **v0.3.0** -- OpenTelemetry tracing + multi-driver queue abstraction

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/nthanhdo/nestjs-boot.git
cd nestjs-boot
npm install
npm test
```

## License

[MIT](LICENSE)
