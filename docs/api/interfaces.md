# BootOptions API Reference

> Master configuration interface for nestjs-boot — passed to `createApp()` to declare which modules are loaded and how they behave. Every top-level key is optional; omitting a key disables that module entirely.

## Interface: `BootOptions`

```ts
import { BootOptions } from 'nestjs-boot';

const app = await createApp(AppModule, options: BootOptions);
```

### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `database` | `DatabaseOptions` | MongoDB connections (multi-connection, reader/writer split) |
| `cache` | `CacheOptions` | Multi-layer cache (L1 in-memory/Memcached + L2 Redis) |
| `logger` | `boolean \| unknown` | NestJS logger override. `false` = disable all logging |
| `response` | `ResponseOptions` | Response envelope + global exception filter |
| `health` | `HealthOptions` | Health check endpoint |
| `auth` | `AuthOptions` | JWT auth + RBAC (opt-in) |
| `shutdown` | `ShutdownOptions` | Graceful shutdown hooks |
| `interServiceAuth` | `InterServiceAuthOptions` | Inter-service JWT propagation (opt-in) |
| `transport` | `TransportOptions` | Hybrid microservice transports (gRPC, TCP, NATS, RMQ) |
| `tracing` | `TracingOptions` | OpenTelemetry distributed tracing |
| `metrics` | `MetricsOptions` | Prometheus metrics collection |
| `logging` | `LoggingOptions` | Structured pino logging |
| `resilience` | `ResilienceOptions` | Circuit breaker + timeout defaults |
| `queue` | `QueueOptions` | BullMQ job queues |
| `events` | `EventBusOptions` | Event bus (memory or Redis pub/sub) |
| `layers` | `LayerOptions` | Module layer enforcement (opt-in, runs at boot) |
| `lazy` | `boolean` | Defer DB/cache connections to first request. Default: `false`. Use only for serverless/FaaS. |
| `monitoring` | `{ errorReporter?: (error: Error, context: Record<string, unknown>) => void }` | Error reporter hook for Sentry, Datadog, etc. without subclassing filters |
| `correlation` | `{ header?: string; generator?: () => string }` | Correlation ID middleware. Default header: `'X-Correlation-Id'`. Default generator: `crypto.randomUUID()` |
| `versioning` | `VersioningOptions` | API versioning (opt-in) |
| `tenancy` | `TenancyOptions` | Multi-tenancy (opt-in) |
| `swagger` | `SwaggerOptions` | Swagger/OpenAPI UI (opt-in; enabled by default in dev). Requires `@nestjs/swagger`. |
| `websocket` | `WebSocketOptions` | WebSocket support via Socket.IO or native `ws`. Requires `@nestjs/websockets`. |
| `webhooks` | `WebhookModuleOptions` | Payment webhook endpoints with HMAC verification + idempotency |
| `storage` | `StorageModuleOptions` | File storage abstraction (`local` \| `s3` \| `gcs`) |
| `cqrs` | `CqrsOptions` | CQRS + Event Sourcing (CommandBus, EventStore, Projections, Snapshots, Outbox) |
| `deploy` | `DeployOptions` | Deploy lifecycle hooks (env validation, dependency checks, K8s readiness gates) |
| `alerts` | `AlertOptions` | Alert notifications (Slack, Discord, PagerDuty, webhooks) |

---

## Sub-interfaces

### `DatabaseOptions`

```ts
interface DatabaseOptions {
  connections: Record<string, ConnectionOptions>;
}
```

### `ConnectionOptions`

```ts
interface ConnectionOptions {
  /** Primary (writer) MongoDB URI — required */
  writerUri: string;
  /** Read-replica URI — optional. Reads auto-route here when provided. */
  readerUri?: string;
  /** Mongoose connection options (pool size, auth, timeouts, TLS, etc.) */
  options?: MongooseConnectionOptions;
}
```

### `MongooseConnectionOptions`

Passthrough to Mongoose `ConnectOptions`. Common fields:

```ts
interface MongooseConnectionOptions {
  maxPoolSize?: number;
  minPoolSize?: number;
  serverSelectionTimeoutMS?: number;
  socketTimeoutMS?: number;
  connectTimeoutMS?: number;
  heartbeatFrequencyMS?: number;
  retryWrites?: boolean;
  retryReads?: boolean;
  w?: string | number;
  wtimeoutMS?: number;
  journal?: boolean;
  authSource?: string;
  authMechanism?: string;
  ssl?: boolean;
  tls?: boolean;
  tlsCAFile?: string;
  tlsCertificateKeyFile?: string;
  replicaSet?: string;
  readPreference?: string;
  [key: string]: unknown; // any additional ConnectOptions
}
```

### `CacheOptions`

```ts
interface CacheOptions {
  /** Redis config for L2 cache layer */
  redis?: RedisCacheOptions;
  /** Memcached config for L1 cache layer (replaces in-memory LRU) */
  memcached?: MemcachedCacheOptions;
  /** Default TTL in seconds (default: 300) */
  defaultTtl?: number;
}
```

### `RedisCacheOptions`

```ts
interface RedisCacheOptions {
  url: string;
}
```

### `MemcachedCacheOptions`

```ts
interface MemcachedCacheOptions {
  /** Memcached server(s) — e.g. 'localhost:11211' or 'host1:11211,host2:11211' */
  servers: string;
}
```

### `ResponseOptions`

```ts
interface ResponseOptions {
  /** Enable unified response envelope interceptor (default: false — opt-in) */
  envelope?: boolean;
  /** Enable global all-exceptions filter (default: true) */
  errorHandler?: boolean;
}
```

### `HealthOptions`

```ts
interface HealthOptions {
  /** Enable health endpoint (default: true) */
  enabled?: boolean;
  /** Health endpoint path (default: '/health') */
  path?: string;
}
```

---

## Usage Example

```ts
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

const app = await createApp(AppModule, {
  database: {
    connections: {
      default: {
        writerUri: process.env.MONGO_URI,
        readerUri: process.env.MONGO_READER_URI,
        options: { maxPoolSize: 20, retryWrites: true },
      },
    },
  },
  cache: {
    redis: { url: process.env.REDIS_URL },
    defaultTtl: 300,
  },
  logging: { level: 'info', redact: ['req.headers.authorization'] },
  metrics: { enabled: true, prefix: 'myapp_' },
  health: { path: '/health' },
  auth: { jwtSecret: process.env.JWT_SECRET },
  layers: { enabled: true, strict: true },
  correlation: { header: 'X-Request-Id' },
  lazy: false,
  monitoring: {
    errorReporter: (err, ctx) => Sentry.captureException(err, { extra: ctx }),
  },
});

await app.listen(3000);
```
