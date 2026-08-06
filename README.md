# nestjs-boot

> Spring Boot-style auto-configuration for NestJS. Multi-database, reader/writer split, multi-layer cache. One config object, zero wiring.

[![npm version](https://img.shields.io/npm/v/nestjs-boot.svg)](https://www.npmjs.com/package/nestjs-boot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/nthanhdo/nestjs-boot/actions/workflows/ci.yml/badge.svg)](https://github.com/nthanhdo/nestjs-boot/actions/workflows/ci.yml)

## Install

```bash
npm install nestjs-boot
```

Peer dependencies:

```bash
npm install @nestjs/common @nestjs/core mongoose rxjs
```

Optional:

```bash
npm install ioredis           # Redis L2 cache
npm install @nestjs/terminus  # Health checks
```

## Quick Start

A complete working example — `main.ts` + one service:

```ts
// main.ts
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {
    database: {
      connections: {
        master: {
          writerUri: process.env.MONGO_URI!,
          readerUri: process.env.MONGO_READER_URI, // optional replica
        },
      },
    },
    cache: {
      redis: { url: process.env.REDIS_URL! },
      defaultTtl: 300,
    },
    response: { envelope: true },
    health: { enabled: true },
  });

  await app.listen(3000);
}

bootstrap();
```

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getWriterConnectionName } from 'nestjs-boot';
import { ProductService } from './product.service';
import { Product, ProductSchema } from './product.schema';

@Module({
  imports: [
    // Register Mongoose schemas on the 'master' writer connection
    MongooseModule.forFeature(
      [{ name: Product.name, schema: ProductSchema }],
      getWriterConnectionName('master'), // → 'master_writer'
    ),
  ],
  providers: [ProductService],
})
export class AppModule {}
```

```ts
// product.service.ts
import { Injectable } from '@nestjs/common';
import { InjectCache, MultiCacheService } from 'nestjs-boot';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from './product.schema';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product.name) private readonly model: Model<ProductDocument>,
    @InjectCache() private readonly cache: MultiCacheService,
  ) {}

  async findById(id: string): Promise<ProductDocument | null> {
    return this.cache.getOrSet(
      `product:${id}`,
      () => this.model.findById(id).exec(),
      { ttl: 60, l2Ttl: 300 },
    );
  }
}
```

That gives you: validated config, MongoDB with reader/writer split, two-layer cache, response envelope, health endpoint at `/health`, and global error handling.

## Before / After

**Before** — manual wiring across multiple files:

```ts
// app.module.ts — ~40 lines of infrastructure
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
    ConfigModule.forRoot({ validationSchema: Joi.object({ /* ... */ }) }),
    TerminusModule.forRoot(),
    // + ResponseInterceptor, AllExceptionsFilter, health indicators ...
  ],
})
export class AppModule {}
```

**After** — one config object:

```ts
// main.ts — that's it
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

const app = await createApp(AppModule, {
  database: {
    connections: {
      master: { writerUri: process.env.MONGO_URI!, readerUri: process.env.MONGO_READER_URI },
      analytics: { writerUri: process.env.MONGO_ANALYTICS_URI! },
    },
  },
  cache: { redis: { url: process.env.REDIS_URL! } },
  health: { enabled: true },
});

await app.listen(3000);
```

Your `AppModule` stays clean — just your business logic and schema registrations.

---

## Modules

### Database

Config-driven multi-connection MongoDB with automatic reader/writer split.

**What it does:** Creates N named MongoDB connections from config. Each connection gets a writer, and optionally a reader that receives all read queries automatically.

**Config:**

```ts
database: {
  connections: {
    master: {
      writerUri: 'mongodb://primary:27017/app',
      readerUri: 'mongodb://replica:27017/app', // optional
    },
    analytics: {
      writerUri: 'mongodb://analytics:27017/metrics',
    },
  },
}
```

**Registering Mongoose schemas:**

`nestjs-boot` does not have a `forFeature` method. Use standard `MongooseModule.forFeature` with the connection name helpers:

```ts
import { MongooseModule } from '@nestjs/mongoose';
import { getWriterConnectionName, getReaderConnectionName } from 'nestjs-boot';

@Module({
  imports: [
    // Writer connection (for reads and writes if no reader configured)
    MongooseModule.forFeature(
      [{ name: 'Product', schema: ProductSchema }],
      getWriterConnectionName('master'), // → 'master_writer'
    ),
    // Reader connection (optional — for read-replica routing)
    MongooseModule.forFeature(
      [{ name: 'Product', schema: ProductSchema }],
      getReaderConnectionName('master'), // → 'master_reader'
    ),
  ],
})
export class ProductModule {}
```

**Injecting raw connections:**

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

**`InjectConnection(connectionName, type?)` parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `connectionName` | `string` | — | Connection name from config (e.g. `'master'`) |
| `type` | `'writer' \| 'reader'` | `'writer'` | Which connection to inject |

**Connection name helpers:**

| Function | Returns | Example |
|----------|---------|---------|
| `getWriterConnectionName(name)` | `string` | `getWriterConnectionName('master')` → `'master_writer'` |
| `getReaderConnectionName(name)` | `string` | `getReaderConnectionName('master')` → `'master_reader'` |
| `getWriterToken(name)` | `string` | Injection token: `'BOOT_DB_MASTER_WRITER'` |
| `getReaderToken(name)` | `string` | Injection token: `'BOOT_DB_MASTER_READER'` |

---

### BaseRepository

Generic CRUD repository with automatic reader/writer routing. All read operations use the reader connection (if configured), all writes go to the writer.

**Usage:**

```ts
import { BaseRepository } from 'nestjs-boot';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from './product.schema';

@Injectable()
export class ProductRepository extends BaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name, 'master_writer') writerModel: Model<ProductDocument>,
    @InjectModel(Product.name, 'master_reader') readerModel: Model<ProductDocument>,
  ) {
    super(writerModel, readerModel);
  }
}
```

**Constructor:** `new BaseRepository(writerModel, readerModel?)`

| Param | Type | Description |
|-------|------|-------------|
| `writerModel` | `Model<T>` | Primary Mongoose model (all writes) |
| `readerModel` | `Model<T>` (optional) | Read-replica model. Falls back to `writerModel` if omitted. |

**Methods:**

| Method | Signature | Uses Reader | Description |
|--------|-----------|:-----------:|-------------|
| `findAll` | `(filter?, options?) → PaginatedResult<T>` | Yes | Paginated query. Options: `{ page, limit, sort, select }` |
| `findById` | `(id: string) → T \| null` | Yes | Find by `_id` |
| `findOne` | `(filter) → T \| null` | Yes | Find first match |
| `count` | `(filter?) → number` | Yes | Count matching documents |
| `aggregate` | `(pipeline: PipelineStage[]) → unknown[]` | Yes | Run aggregation pipeline |
| `exists` | `(filter) → boolean` | Yes | Check if any document matches |
| `create` | `(data: Partial<T>) → T` | No | Insert one document |
| `createMany` | `(data: Partial<T>[]) → T[]` | No | Insert multiple documents |
| `update` | `(id: string, data: Partial<T>) → T \| null` | No | Update by `_id`, returns updated doc |
| `updateMany` | `(filter, data) → { modifiedCount }` | No | Update all matching documents |
| `delete` | `(id: string) → T \| null` | No | Delete by `_id`, returns deleted doc |
| `deleteMany` | `(filter) → { deletedCount }` | No | Delete all matching documents |

**`FindAllOptions`:**

```ts
interface FindAllOptions {
  page?: number;                        // default: 1
  limit?: number;                       // default: 20
  sort?: Record<string, 1 | -1>;       // e.g. { createdAt: -1 }
  select?: string | Record<string, 1 | 0>;
}
```

**`PaginatedResult<T>`:**

```ts
interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

---

### CachedBaseRepository

Extends `BaseRepository` with automatic cache-aside. Read methods check cache first (key = MD5 of collection + method + args). Write methods invalidate the collection's cache prefix.

**Constructor:** `new CachedBaseRepository(writerModel, readerModel, cacheService, cacheTtl?)`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `writerModel` | `Model<T>` | — | Primary Mongoose model |
| `readerModel` | `Model<T> \| undefined` | — | Read-replica model |
| `cacheService` | `MultiCacheService` | — | The multi-layer cache instance |
| `cacheTtl` | `number` | `300` | TTL in seconds for cached read results |

**Usage:**

```ts
import { CachedBaseRepository, InjectCache, MultiCacheService } from 'nestjs-boot';

@Injectable()
export class CachedProductRepository extends CachedBaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name, 'master_writer') writerModel: Model<ProductDocument>,
    @InjectModel(Product.name, 'master_reader') readerModel: Model<ProductDocument>,
    @InjectCache() cacheService: MultiCacheService,
  ) {
    super(writerModel, readerModel, cacheService, 600); // 10 min TTL
  }
}
```

All `BaseRepository` read methods are overridden with cache-first logic. All write methods auto-invalidate the collection's cache entries.

---

### Cache

Multi-layer cache with size-aware routing and cache-aside pattern.

**What it does:** L1 in-memory LRU + optional L2 Redis. Reads check L1 then L2 (with write-back). Values under 1MB go to both layers; larger values go to L2 only to avoid L1 memory pressure.

**Config:**

```ts
cache: {
  redis: { url: 'redis://localhost:6379' },  // L2 — requires ioredis
  defaultTtl: 300,                            // seconds (default: 300)
}
```

If `ioredis` is not installed, a warning is logged and only L1 (in-memory LRU) is used.

**Usage:**

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
      { ttl: 60, l2Ttl: 300 },
    );
  }

  async invalidateAll(): Promise<void> {
    await this.cache.delByPrefix('price:');
  }
}
```

**`MultiCacheService` methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `get<T>` | `(key: string) → T \| undefined` | L1 → L2 → undefined. Writes back to L1 on L2 hit. |
| `set` | `(key, value, opts?) → void` | Size-aware write to L1 + L2. |
| `del` | `(key: string) → void` | Delete from all layers. |
| `delByPrefix` | `(prefix: string) → void` | Prefix deletion across all layers. |
| `getOrSet<T>` | `(key, factory, opts?) → T` | Cache-aside: return cached or call factory and cache result. |
| `has` | `(key: string) → boolean` | Check existence in any layer. |

**`CacheSetOptions`:**

```ts
interface CacheSetOptions {
  ttl?: number;    // L1 TTL in seconds (default: defaultTtl from config)
  l2Ttl?: number;  // L2 TTL in seconds (default: 2x ttl)
}
```

---

### Config

Typed access to the validated boot config from anywhere in your app.

**What it does:** Validates the `BootOptions` object on startup using Joi, then provides typed dot-notation access to any config value.

**Usage:**

```ts
import { Injectable } from '@nestjs/common';
import { BootConfigService } from 'nestjs-boot';

@Injectable()
export class SomeService {
  constructor(private readonly config: BootConfigService) {}

  doSomething() {
    const uri = this.config.get<string>('database.connections.master.writerUri');
    const ttl = this.config.get<number>('cache.defaultTtl');

    // Throws if path doesn't exist:
    const redisUrl = this.config.getOrThrow<string>('cache.redis.url');

    // Full config object:
    const all = this.config.getAll();
  }
}
```

**`BootConfigService` methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `get<T>` | `(path: string) → T \| undefined` | Dot-notation path lookup. Returns `undefined` if not found. |
| `getOrThrow<T>` | `(path: string) → T` | Same as `get`, but throws `Error` if path is undefined. |
| `getAll` | `() → Readonly<BootOptions>` | Returns the full validated config object. |

---

### Response Envelope

Opt-in unified response format. Off by default.

**What it does:** Wraps all handler responses into `{ statusCode, message, data }`. Detects paginated responses (`{ data, total, page, limit }`) and spreads them into the envelope. Skips responses that are already enveloped.

**Config:**

```ts
response: {
  envelope: true,      // enable response wrapper (default: false)
  errorHandler: true,  // enable global exception filter (default: true)
}
```

**Success response:**

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { "id": "123", "name": "Widget" }
}
```

**Paginated response** (when handler returns `{ data, total, page, limit }`):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [{ "id": "1" }, { "id": "2" }],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

**Error response** (from `AllExceptionsFilter`):

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "BadRequestException",
  "details": ["name must be a string", "price must be positive"],
  "timestamp": "2026-08-06T10:00:00.000Z",
  "path": "/api/products"
}
```

The error filter handles `HttpException` (extracts status + message), `ValidationPipe` errors (extracts `details` array), and unknown errors (500).

---

### Health

Auto-detects configured drivers and registers health indicators.

**What it does:** If `database` is configured, registers a MongoDB health indicator. If `cache.redis` is configured, registers a Redis health indicator. Exposes a `GET` endpoint.

**Config:**

```ts
health: {
  enabled: true,       // default: true
  path: '/health',     // default: '/health'
}
```

Requires `@nestjs/terminus` as a peer dependency.

---

### Metrics

Prometheus metrics endpoint with automatic HTTP request tracking.

**Config:** `metrics: { path: '/metrics', prefix: 'myapp_', defaultMetrics: true }`. Exposes a `/metrics` endpoint for Prometheus scraping. `HttpMetricsInterceptor` is applied globally when configured, tracking request duration and count by method/route/status.

---

### Logging

Structured logging with pino, correlation ID injection, and request logging.

**Config:** `logging: { level: 'info', pretty: true, redact: ['req.headers.authorization'] }`. Replaces the NestJS default logger with `BootLogger` (pino-based). `LoggingInterceptor` logs request/response timing automatically. Requires `pino` as peer dependency; `pino-pretty` optional for dev.

---

### Tracing

OpenTelemetry distributed tracing with auto-instrumentation.

**Config:** `tracing: { exporter: 'otlp', endpoint: 'http://localhost:4318/v1/traces', sampleRate: 0.1 }`. `initTracing()` is called before `NestFactory.create` so OTel patches HTTP/gRPC/Mongo at import time. Supports `otlp`, `jaeger`, `zipkin`, and `console` exporters. All `@opentelemetry/*` packages are optional peers.

---

### Resilience

Decorators for fault tolerance: `@CircuitBreaker()`, `@Retry()`, `@Timeout()`.

**Config:** `resilience: { timeout: { default: 5000 }, circuitBreaker: { failureThreshold: 5 } }`. `@CircuitBreaker()` wraps methods with CLOSED/OPEN/HALF_OPEN state machine. `@Retry()` adds configurable retry with exponential/fixed backoff. `@Timeout()` sets per-route or global request timeouts via `TimeoutInterceptor`.

---

### Queue

BullMQ-based job queue with decorator-driven processors.

**Config:** `queue: { driver: 'bullmq', redis: { url: 'redis://localhost:6379' } }`. Use `QueueService.addJob(queue, name, data)` to enqueue. Decorate processor classes with `@Processor('queueName')` and methods with `@Process('jobName')`, `@OnCompleted()`, `@OnFailed()`.

---

### EventBus

In-process or Redis pub/sub event system with typed events.

**Config:** `events: { transport: 'memory' }` or `events: { transport: 'redis', redis: { url: '...' } }`. Emit events via `EventBusService.emit(event)`. Subscribe with `@OnEvent('event.name')` decorator. Events extend `BootEvent` base class for type safety.

---

### Testing Helpers

Utilities for integration tests: `createTestApp()`, `seedDatabase()`, `cleanDatabase()`, `createMockGrpcService()`, `ContractVerifier`.

`createTestApp(AppModule, bootOptions)` spins up a fully-wired test app with overrides. `ContractVerifier` validates gRPC service contracts against proto definitions.

---

### CLI

Scaffold new projects with `npx nestjs-boot new my-service`. Generates a ready-to-run project with `createApp()` wiring, Docker, CI, and example module.

See `examples/` directory for a complete working project reference.

---

## Full Config Reference

The complete `BootOptions` interface — every field documented:

```ts
interface BootOptions {
  database?: {
    connections: Record<string, {
      writerUri: string;        // Primary MongoDB URI (required)
      readerUri?: string;       // Read-replica MongoDB URI (optional)
      options?: MongooseConnectionOptions;
    }>;
  };

  cache?: {
    redis?: { url: string };    // Redis connection URL for L2 cache
    memcached?: { servers: string };
    defaultTtl?: number;        // Default TTL in seconds (default: 300)
  };

  response?: {
    envelope?: boolean;         // Wrap responses in { data, message, statusCode } (default: false)
    errorHandler?: boolean;     // Global exception filter (default: true)
  };

  health?: {
    enabled?: boolean;          // Enable /health endpoint (default: true)
    path?: string;              // Health endpoint path (default: '/health')
  };

  auth?: {
    jwt?: { secret: string; signOptions?: { expiresIn?: string | number } };
    apiKey?: { enabled: boolean; validate: (key: string) => Promise<boolean> };
    rbac?: { enabled: boolean };
  };

  correlation?: {
    header?: string;            // Header name (default: 'X-Correlation-Id')
    generator?: () => string;
  };

  shutdown?: {
    timeout?: number;           // Graceful shutdown timeout in ms
    signals?: string[];         // Signals to listen for (default: ['SIGTERM', 'SIGINT'])
  };

  transport?: {
    grpc?: { url: string; package: string | string[]; protoPath: string | string[] };
    tcp?: { host?: string; port?: number };
    nats?: { url: string; queue?: string };
    rabbitmq?: { urls: string[]; queue: string };
    clients?: Record<string, { transport: string; options: object }>;
  };

  interServiceAuth?: {
    propagation?: boolean;
    serviceToken?: string;
    headerName?: string;
  };

  metrics?: {
    enabled?: boolean;          // Enable metrics endpoint (default: true)
    path?: string;              // Metrics endpoint path (default: '/metrics')
    prefix?: string;            // Metric name prefix (e.g. 'myapp_')
    defaultMetrics?: boolean;   // Collect Node.js process metrics (default: true)
  };

  logging?: {
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'; // default: 'info'
    pretty?: boolean;           // Pretty-print logs (default: NODE_ENV !== 'production')
    redact?: string[];          // Paths to redact (e.g. ['req.headers.authorization'])
  };

  tracing?: {
    enabled?: boolean;          // Enable tracing (default: true)
    exporter: 'otlp' | 'jaeger' | 'zipkin' | 'console';
    endpoint?: string;          // Exporter endpoint URL
    serviceName?: string;       // Service name (default: package.json name)
    sampleRate?: number;        // 0.0–1.0 (default: 1.0)
  };

  resilience?: {
    circuitBreaker?: {
      failureThreshold?: number;  // Failures before OPEN (default: 5)
      resetTimeout?: number;      // Ms before HALF_OPEN (default: 30000)
      halfOpenMax?: number;       // Max HALF_OPEN requests (default: 1)
    };
    timeout?: {
      default?: number;           // Default request timeout in ms (default: 30000)
    };
  };

  queue?: {
    driver: 'bullmq';
    redis: { url: string };
    defaultOptions?: {
      attempts?: number;
      backoff?: { type: 'exponential' | 'fixed'; delay: number };
      removeOnComplete?: boolean | number;
      removeOnFail?: boolean | number;
    };
  };

  events?: {
    transport: 'memory' | 'redis';
    redis?: { url: string };
  };

  logger?: boolean | unknown;   // NestJS logger option (overridden by logging module)
}
```

Every top-level section is optional. Omitted sections = that module is not loaded.

---

## Standalone Usage

You can use any module without `createApp` by calling `.register()` directly:

### Database only

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';

@Module({
  imports: [
    DatabaseModule.register({
      connections: {
        master: { writerUri: process.env.MONGO_URI! },
      },
    }),
  ],
})
export class AppModule {}
```

### Cache only

```ts
import { Module } from '@nestjs/common';
import { CacheModule } from 'nestjs-boot';

@Module({
  imports: [
    CacheModule.register({
      redis: { url: process.env.REDIS_URL! },
      defaultTtl: 600,
    }),
  ],
})
export class AppModule {}
```

### Config only

```ts
import { Module } from '@nestjs/common';
import { BootConfigModule } from 'nestjs-boot';

@Module({
  imports: [
    BootConfigModule.register({
      database: { connections: { master: { writerUri: '...' } } },
    }),
  ],
})
export class AppModule {}
```

### Health only

```ts
import { Module } from '@nestjs/common';
import { HealthModule } from 'nestjs-boot';

@Module({
  imports: [
    HealthModule.register({
      database: { connections: { master: { writerUri: '...' } } },
      health: { path: '/healthz' },
    }),
  ],
})
export class AppModule {}
```

Note: `HealthModule.register()` takes the full `BootOptions` object (not just `HealthOptions`) so it can auto-detect which drivers to monitor.

All modules are `@Global()` (except `HealthModule`), so their providers are available app-wide without re-importing.

---

## `createApp()` Reference

```ts
function createApp(
  AppModule: Type<unknown>,
  options: BootOptions,
): Promise<INestApplication>
```

1. Validates `options` via Joi
2. Initializes OpenTelemetry tracing (if configured) — before NestFactory
3. Builds infrastructure modules from config (only loads what you configure)
4. Wraps your `AppModule` with infrastructure
5. Creates the NestJS app (`NestFactory.create`)
6. Sets `BootLogger` as app logger (if `logging` configured)
7. Applies global interceptors (response envelope, timeout, HTTP metrics, logging)
8. Applies global filters (exceptions, RPC)
9. Connects microservice transports
10. Enables shutdown hooks
11. Returns the ready `INestApplication`

---

## Optional Peer Dependencies

Install only what you use:

```bash
npm install pino                              # Logging module
npm install pino-pretty                       # Pretty dev logs
npm install prom-client                       # Metrics module
npm install @opentelemetry/sdk-node           # Tracing module
npm install @opentelemetry/exporter-trace-otlp-http  # OTLP exporter
npm install bullmq                            # Queue module
npm install @nestjs/terminus                  # Health checks
```

## Contributing

```bash
git clone https://github.com/nthanhdo/nestjs-boot.git
cd nestjs-boot
npm install
npm test
```

## License

[MIT](LICENSE)
