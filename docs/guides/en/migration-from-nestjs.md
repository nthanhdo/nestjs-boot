# Migrating from Plain NestJS to nestjs-boot

> **TL;DR** — Replace `NestFactory.create` with `createApp(AppModule, {})` -- your existing modules stay untouched. Then adopt database, auth, cache, observability, and resilience modules one at a time, removing your custom implementations as you go.

This guide walks you through adopting nestjs-boot in an existing NestJS project.
Each phase is independent — adopt only what you need, in any order.

---

## Phase 1: Install + createApp Wrapper

Replace `NestFactory.create` with nestjs-boot's `createApp`. Your existing modules stay untouched.

```bash
npm install nestjs-boot
```

**Before:**
```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(3000);
}
bootstrap();
```

**After:**
```ts
// main.ts
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {
    // Empty config — all modules opt-in. Your AppModule works as-is.
    health: { path: '/health' },
    shutdown: {},
  });
  await app.listen(3000);
}
bootstrap();
```

`createApp` wraps your `AppModule` with infrastructure modules based on the config object.
Omitted keys = module not loaded. Your existing providers, controllers, and imports are unchanged.

**What you get immediately:** health endpoint, graceful shutdown, structured DI error messages,
and `.env` / `.env.{NODE_ENV}` file loading (if `dotenv` is installed).

---

## Phase 2: Migrate Database Connections

Replace your custom Mongoose setup with `BootOptions.database`.

**Before:**
```ts
// app.module.ts
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI, {
      maxPoolSize: 20,
    }),
  ],
})
export class AppModule {}
```

**After:**
```ts
// main.ts — add database to BootOptions
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: process.env.MONGO_URI,
        readerUri: process.env.MONGO_READER_URI, // optional read replica
        options: { maxPoolSize: 20 },
      },
    },
  },
});
```

Remove `MongooseModule.forRoot()` from `AppModule`. Keep `MongooseModule.forFeature()` for schemas.
nestjs-boot registers connections by name — inject via `@InjectConnection('master')`.

**Multi-database:** Add more keys to `connections` for separate databases (e.g., `analytics`, `logs`).

---

## Phase 3: Replace Custom Auth with AuthModule

Swap hand-rolled JWT guards and strategies for nestjs-boot's `AuthModule`.

**Before:**
```ts
// auth.module.ts — 60+ lines of JwtModule, PassportModule, strategy, guard
@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } }),
    PassportModule,
  ],
  providers: [JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
```

**After:**
```ts
// main.ts — add auth to BootOptions
const app = await createApp(AppModule, {
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h', algorithm: 'HS256' },
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      resetSecret: process.env.JWT_RESET_SECRET,
    },
    rbac: {
      enabled: true,
      extractRoles: (req) => req.user?.roles ?? [],
    },
  },
});
```

Remove your custom `AuthModule`, `JwtStrategy`, `JwtAuthGuard`, and `RolesGuard`.
Use nestjs-boot's built-in `@Auth()` and `@Roles('admin')` decorators on controllers.

**API key auth** can be added alongside JWT:
```ts
auth: {
  jwt: { /* ... */ },
  apiKey: {
    enabled: true,
    validate: async (key) => keyStore.verify(key),
  },
}
```

---

## Phase 4: Add Cache Layer

Replace a manual Redis + in-memory setup with the built-in two-layer cache.

**Before:**
```ts
// cache.module.ts
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [CacheModule.register({ store: redisStore, url: process.env.REDIS_URL, ttl: 300 })],
})
export class AppCacheModule {}
```

**After:**
```ts
// main.ts — add cache to BootOptions
const app = await createApp(AppModule, {
  cache: {
    redis: { url: process.env.REDIS_URL },
    defaultTtl: 300,
  },
});
```

Remove your custom cache module. Inject `CacheService` from nestjs-boot.
L1 (in-memory LRU) handles hot keys; L2 (Redis) is the shared layer. Both are transparent.

---

## Phase 5: Add Observability

Replace scattered logging, metrics, and tracing setups with unified config.

**Before:**
```ts
// main.ts — manual pino, prom-client, OpenTelemetry SDK init (100+ lines across 3 files)
import pino from 'pino';
const logger = pino({ level: 'info' });
// ... prometheus registry, /metrics endpoint, OTel NodeSDK...
```

**After:**
```ts
const app = await createApp(AppModule, {
  logging: { level: 'info' },
  metrics: { path: '/metrics' },
  tracing: {
    exporter: 'otlp',
    endpoint: 'http://otel-collector:4318',
    sampleRate: 0.1,
  },
  correlation: {},
  monitoring: {
    errorReporter: (error, ctx) => Sentry.captureException(error, { extra: ctx }),
  },
});
```

Delete your custom logger factory, metrics middleware, and tracing init file.
Every log line gets a `correlationId`; every HTTP request gets a Prometheus histogram +
an OTel span — automatically.

---

## Phase 6: Add Resilience Patterns

Replace hand-rolled retry loops and timeout middleware with declarative config + decorators.

**Before:**
```ts
// retry.helper.ts — 40 lines of exponential backoff logic
async function withRetry(fn, maxAttempts = 3) { /* ... */ }

// timeout.middleware.ts
app.use((req, res, next) => {
  req.setTimeout(30000, () => res.status(408).end());
  next();
});
```

**After:**
```ts
// main.ts — add resilience to BootOptions
const app = await createApp(AppModule, {
  resilience: {
    circuitBreaker: { failureThreshold: 5, resetTimeout: 30000 },
    timeout: { default: 10000 },
  },
});
```

Use decorators on individual methods for fine-grained control:
```ts
@CircuitBreaker({ failureThreshold: 3 })
@Retry({ maxAttempts: 3, backoff: 'exponential' })
@Timeout(5000)
async callExternalApi() { /* ... */ }
```

Delete your custom retry helper and timeout middleware.

---

## What You Can Skip

Every nestjs-boot module is opt-in. Omit the config key and the module is not loaded.

| Module | Skip if... |
|--------|-----------|
| `database` | You manage Mongoose/TypeORM connections yourself |
| `cache` | You don't need caching or use a different library |
| `auth` | You have a custom auth system you want to keep |
| `tracing` | You don't use OpenTelemetry |
| `metrics` | You don't use Prometheus |
| `queue` | You don't use BullMQ |
| `transport` | HTTP-only service (no gRPC/TCP/NATS/RMQ) |
| `tenancy` | Single-tenant application |
| `webhooks` | No payment webhook handling needed |
| `storage` | No file upload/download needed |
| `cqrs` | No event sourcing needed |

---

## Common Migration Pitfalls

**1. Double-registering modules** — If you add `database` to BootOptions but keep
`MongooseModule.forRoot()` in `AppModule`, you get two connection pools. Remove the
old import when migrating each module.

**2. Forgetting `rawBody: true` for webhooks** — Stripe/PayPal signature verification needs
the raw request body. If you use the `webhooks` module, ensure your NestFactory or createApp
setup passes `{ rawBody: true }` to the underlying Express adapter.

**3. Tracing init order** — OTel SDK must patch `http`/`express` before NestJS imports them.
`createApp` handles this automatically (step 2 in the bootstrap sequence). If you call
`initTracing` manually, call it before `NestFactory.create`.

**4. Shutdown hooks registered twice** — `createApp` calls `app.enableShutdownHooks()` when
`shutdown` is set. Don't call it again in your bootstrap function.

**5. `.env` loading conflicts** — `createApp` loads `.env` and `.env.{NODE_ENV}` automatically
(if `dotenv` is installed). If you have your own `dotenv.config()` call, remove it to avoid
double-loading with different override behavior.

**6. Logger replacement** — When `logging` is set, nestjs-boot replaces the NestJS logger with
`BootLogger` (pino-based). Custom `Logger` providers in your app may conflict. Remove them
or keep `logging` unset.
