# Config API Reference

> Validated, typed, globally-available configuration. Supports synchronous registration and async factories for loading secrets from Vault, AWS Secrets Manager, or other external providers.

## Module Registration

### `BootConfigModule.register(options: BootOptions)`

Validate and register configuration synchronously. Validation uses Joi — throws immediately on invalid config (fail-fast).

```ts
import { BootConfigModule } from '@nestjs-boot/config';

BootConfigModule.register({
  database: {
    connections: {
      master: { writerUri: 'mongodb+srv://...', readerUri: 'mongodb+srv://...' },
    },
  },
  cache: { redis: { url: 'redis://localhost:6379' }, defaultTtl: 300 },
  auth: {
    jwt: { secret: 'my-32-char-minimum-secret-here!!', signOptions: { expiresIn: '1h' } },
  },
})
```

### `BootConfigModule.registerAsync(asyncOptions: BootConfigAsyncOptions)`

Load configuration asynchronously — useful when secrets must be fetched from external providers at startup.

```ts
BootConfigModule.registerAsync({
  imports: [VaultModule],
  inject: [VaultService],
  useFactory: async (vault: VaultService) => {
    const secrets = await vault.getSecrets('my-service');
    return {
      database: { connections: { master: { writerUri: secrets.MONGO_URI } } },
    };
  },
})
```

`BootConfigModule` is `global: true` — register once in the root `AppModule`.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `database` | `DatabaseOptions` | — | MongoDB connection config |
| `database.connections` | `Record<string, ConnectionConfig>` | — | Named connection map. At least one required |
| `database.connections.<name>.writerUri` | `string` | — | **Required.** MongoDB URI (`mongodb://` or `mongodb+srv://`) |
| `database.connections.<name>.readerUri` | `string` | — | Optional read-replica URI |
| `cache` | `CacheOptions` | — | Cache configuration (see `cache.md`) |
| `cache.redis.url` | `string` | — | Redis URL (`redis://` or `rediss://`) |
| `cache.memcached.servers` | `string` | — | Memcached server string |
| `cache.defaultTtl` | `number` | `300` | Default TTL in seconds |
| `auth` | `AuthOptions` | — | Auth configuration (see `auth.md`) |
| `auth.jwt.secret` | `string` (min 32) | — | HMAC-SHA256 secret |
| `response.envelope` | `boolean` | `false` | Wrap all responses in `{ statusCode, message, data }` |
| `response.errorHandler` | `boolean` | `true` | Register `AllExceptionsFilter` globally |
| `health.enabled` | `boolean` | `true` | Enable health check endpoint |
| `health.path` | `string` | `'/health'` | Health check route path |
| `logging.level` | `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'info'` | Log level |
| `logging.pretty` | `boolean` | — | Pretty-print logs (dev only) |
| `logging.redact` | `string[]` | — | Field paths to redact from logs |
| `metrics.enabled` | `boolean` | `true` | Enable Prometheus metrics endpoint |
| `metrics.path` | `string` | — | Prometheus scrape path |
| `metrics.prefix` | `string` | — | Metric name prefix |
| `metrics.defaultMetrics` | `boolean` | `true` | Collect default Node.js metrics |
| `tracing.enabled` | `boolean` | — | Enable OpenTelemetry tracing |
| `tracing.exporter` | `'otlp' \| 'jaeger' \| 'zipkin' \| 'console'` | — | **Required when `tracing` is set** |
| `tracing.endpoint` | `string` | — | Exporter endpoint URL |
| `tracing.serviceName` | `string` | — | Service name in traces |
| `tracing.sampleRate` | `number` (0–1) | — | Trace sampling rate |
| `resilience.circuitBreaker.failureThreshold` | `number` | — | Failures before circuit opens |
| `resilience.circuitBreaker.resetTimeout` | `number` | — | ms before half-open probe |
| `resilience.circuitBreaker.halfOpenMax` | `number` | — | Max requests in half-open state |
| `resilience.timeout.default` | `number` | — | Default operation timeout in ms |
| `queue.driver` | `'bullmq'` | — | **Required when `queue` is set** |
| `queue.redis.url` | `string` | — | Redis URL for BullMQ |
| `queue.defaultOptions.attempts` | `number` | — | Default job retry attempts |
| `queue.defaultOptions.backoff.type` | `'exponential' \| 'fixed'` | — | Backoff strategy |
| `queue.defaultOptions.backoff.delay` | `number` | — | Backoff delay in ms |
| `events.transport` | `'memory' \| 'redis'` | — | **Required when `events` is set** |
| `events.redis.url` | `string` | — | Redis URL (required for `redis` transport) |
| `cqrs.eventStore` | `'mongodb' \| 'memory'` | — | **Required when `cqrs` is set** |
| `cqrs.snapshotStore` | `'mongodb' \| 'memory'` | — | Snapshot backend |
| `cqrs.snapshotFrequency` | `number` | `100` | Events between snapshots |
| `cqrs.outbox.enabled` | `boolean` | — | Enable transactional outbox pattern |
| `cqrs.outbox.pollInterval` | `number` | `1000` | Outbox poll interval in ms |
| `cqrs.outbox.maxRetries` | `number` | `5` | Max outbox delivery retries |
| `versioning.type` | `'uri' \| 'header' \| 'media-type'` | `'uri'` | API versioning strategy |
| `versioning.defaultVersion` | `string` | `'1'` | Default API version |
| `versioning.header` | `string` | `'X-API-Version'` | Header name for header versioning |
| `versioning.mediaTypeKey` | `string` | `'version'` | Media type key for media-type versioning |
| `tenancy.strategy` | `'header' \| 'subdomain' \| 'path'` | — | **Required when `tenancy` is set** |
| `tenancy.headerName` | `string` | `'X-Tenant-ID'` | Tenant ID header |
| `tenancy.isolation` | `'database' \| 'schema' \| 'row'` | `'row'` | Data isolation model |
| `websocket.adapter` | `'socket.io' \| 'ws'` | `'socket.io'` | WebSocket adapter |
| `websocket.redis.url` | `string` | — | Redis URL for WebSocket scaling |
| `websocket.cors.origin` | `string \| string[]` | — | Allowed CORS origins |
| `websocket.path` | `string` | `'/socket.io'` | Socket.IO path |
| `transport.grpc.url` | `string` | — | gRPC server address (e.g. `'0.0.0.0:5000'`) |
| `transport.grpc.package` | `string \| string[]` | — | Protobuf package name(s) |
| `transport.grpc.protoPath` | `string \| string[]` | — | Path to `.proto` file(s) |
| `transport.tcp.host` | `string` | — | TCP host |
| `transport.tcp.port` | `number` | — | TCP port (1–65535) |
| `transport.nats.url` | `string` | — | NATS server URL |
| `transport.rabbitmq.urls` | `string[]` | — | RabbitMQ URLs (at least one required) |
| `transport.rabbitmq.queue` | `string` | — | RabbitMQ queue name |
| `correlation.header` | `string` | — | Correlation ID header name |
| `correlation.generator` | `() => string` | — | Custom correlation ID generator |
| `shutdown.timeout` | `number` | — | Graceful shutdown timeout in ms |
| `shutdown.signals` | `string[]` | — | OS signals to handle for shutdown |
| `interServiceAuth.propagation` | `boolean` | — | Propagate auth token to downstream services |
| `interServiceAuth.serviceToken` | `string` | — | Static service-to-service token |
| `interServiceAuth.headerName` | `string` | — | Header name for service token |

---

## Classes

### `BootConfigService`

> Typed, dot-notation accessor for the validated `BootOptions` config.

Inject via `BootConfigService` class token. Exported by `BootConfigModule`.

#### Methods

##### `get<T>(path: BootConfigPath | string): T | undefined`

Get a config value by dot-notation path. Returns `undefined` if the path does not exist.

Autocomplete is available for all known `BootOptions` paths.

```ts
const uri = configService.get<string>('database.connections.master.writerUri');
const ttl = configService.get<number>('cache.defaultTtl'); // 300
```

##### `getOrThrow<T>(path: BootConfigPath | string): T`

Same as `get()` but throws `Error` if the path is not defined.

```ts
const secret = configService.getOrThrow<string>('auth.jwt.secret');
```

##### `getAll(): Readonly<BootOptions>`

Return the full validated `BootOptions` object.

##### `section<K extends keyof BootOptions>(key: K): BootOptions[K]`

Return a typed top-level config section. Equivalent to `getAll()[key]` but more ergonomic.

```ts
const db = configService.section('database');
// typed as DatabaseOptions | undefined
```

##### `getSchema(): Record<string, unknown>`

Return the Joi schema description — all valid keys, types, defaults, and constraints. Useful for generating config documentation.

---

### `ConfigWatcher`

> Development-only file watcher. Monitors a `.env` file and calls a callback when it changes. **Never use in production** — throws if called with `NODE_ENV === 'production'`.

```ts
// main.ts
if (process.env.NODE_ENV !== 'production') {
  const watcher = new ConfigWatcher();
  watcher.watch('.env', (path) => {
    console.warn(`[nestjs-boot] ${path} changed. Restart to apply.`);
  });
  // In shutdown hook:
  watcher.stop();
}
```

#### Methods

##### `watch(envPath: string, onChange: (path: string) => void): void`

Watch a file for changes. Debounces rapid events (100ms). Throws if called in production or if the file does not exist.

##### `stop(): void`

Close all active file watchers. Call in your application shutdown hook.

---

## Functions

### `createDevConfigWatcher(envPaths: string | string[]): ConfigWatcher`

Convenience wrapper. Creates a `ConfigWatcher` that logs a restart reminder on `.env` file changes. Silently skips paths that do not exist.

```ts
const watcher = createDevConfigWatcher(['.env', `.env.${process.env.NODE_ENV}`]);
// On shutdown:
watcher.stop();
```

### `validateBootOptions(options: BootOptions): BootOptions`

Validate a `BootOptions` object against the Joi schema. Throws with clear field-level messages on failure. Called internally by `BootConfigModule.register()` and `registerAsync()`.

---

## Interfaces

### `BootConfigAsyncOptions`

```ts
interface BootConfigAsyncOptions {
  imports?: Type<unknown>[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<BootOptions> | BootOptions;
}
```

### `ConfigSource`

Interface for pluggable config sources (AWS Secrets Manager, Vault, remote HTTP, local `.env`):

```ts
interface ConfigSource {
  readonly name: string;
  load(): Promise<Record<string, unknown>>;
}
```

Implement and pass to `mergeConfigs()` to combine multiple sources with priority ordering.

### `BootConfigPath` (type)

Auto-generated union type of all valid dot-notation paths through `BootOptions`. Provides IDE autocomplete for `configService.get()` and `configService.getOrThrow()`.

---

## Constants / Tokens

| Token | Type | Description |
|-------|------|-------------|
| `BOOT_OPTIONS` | `string` (`'BOOT_OPTIONS'`) | Injection token for the validated `BootOptions` object |
