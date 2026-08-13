# Configuration

> **TL;DR** — Pass a single `BootOptions` object to `createApp()`. Every section is optional — omit it and that module is not loaded. Use `BootConfigService` for typed runtime access. Load secrets from Vault or AWS via built-in config adapters.

## BootOptions reference

The `BootOptions` interface is the single config object passed to `createApp()`. Every section is optional — omit a section and that module is not loaded.

```ts
import { createApp } from 'nestjs-boot';
import { BootOptions } from 'nestjs-boot/interfaces/boot-options.interface';

const config: BootOptions = {
  database: { /* ... */ },
  cache: { /* ... */ },
  auth: { /* ... */ },
  // ... only what you need
};

const app = await createApp(AppModule, config);
```

### Top-level options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `database` | `DatabaseOptions` | — | MongoDB connections (multi-connection, reader/writer split) |
| `cache` | `CacheOptions` | — | Multi-layer cache (L1 memory + L2 Redis) |
| `auth` | `AuthOptions` | — | JWT + API key + RBAC |
| `health` | `HealthOptions` | `{ enabled: true, path: '/health' }` | Health check endpoint |
| `response` | `ResponseOptions` | `{ envelope: false, errorHandler: true }` | Response envelope + error filter |
| `logger` | `boolean \| any` | NestJS default | NestJS logger. Set `false` to disable |
| `logging` | `LoggingOptions` | — | Pino structured logging |
| `metrics` | `MetricsOptions` | — | Prometheus metrics |
| `tracing` | `TracingOptions` | — | OpenTelemetry tracing |
| `transport` | `TransportOptions` | — | Microservice transports |
| `queue` | `QueueOptions` | — | BullMQ job queues |
| `events` | `EventBusOptions` | — | Event bus (memory/Redis) |
| `resilience` | `ResilienceOptions` | — | Circuit breaker + timeout |
| `shutdown` | `ShutdownOptions` | — | Graceful shutdown |
| `correlation` | `object` | — | Correlation ID middleware |
| `interServiceAuth` | `InterServiceAuthOptions` | — | Service-to-service auth propagation |
| `versioning` | `VersioningOptions` | — | API versioning |
| `tenancy` | `TenancyOptions` | — | Multi-tenancy |
| `swagger` | `SwaggerOptions` | — | OpenAPI docs |
| `websocket` | `WebSocketOptions` | — | WebSocket scaling |
| `webhooks` | `WebhookModuleOptions` | — | Payment webhooks |
| `storage` | `StorageModuleOptions` | — | File storage |
| `cqrs` | `CqrsOptions` | — | CQRS + Event Sourcing |
| `lazy` | `boolean` | `false` | Defer connections until first request (serverless) |
| `monitoring` | `object` | — | Error reporter hook (Sentry, Datadog) |

## Environment files

`createApp()` auto-loads `.env` files using dotenv (if installed):

1. `.env` — base config (loaded first, lower priority)
2. `.env.{BOOT_ENV || NODE_ENV}` — environment-specific overrides (loaded second, higher priority)

```bash
# .env
DATABASE_URI=mongodb://localhost:27017/myapp
CACHE_TTL=300

# .env.production
DATABASE_URI=mongodb+srv://prod-cluster/myapp
CACHE_TTL=600
```

`BOOT_ENV` takes precedence over `NODE_ENV` for file selection. This lets you separate config profiles from Node's runtime mode.

## Config adapters

nestjs-boot provides a `ConfigSource` interface and three built-in adapters for loading config from external sources. Sources are merged with `mergeConfigs()` — later sources override earlier ones.

### ConfigSource interface

```ts
interface ConfigSource {
  readonly name: string;
  load(): Promise<Record<string, unknown>>;
}
```

### EnvFileAdapter

Loads key-value pairs from a `.env` file using dotenv.

```ts
import { EnvFileAdapter } from 'nestjs-boot/config/adapters';

const source = new EnvFileAdapter('.env');
const values = await source.load();
// { DATABASE_URI: 'mongodb://...', CACHE_TTL: '300' }
```

### VaultAdapter

Loads secrets from HashiCorp Vault KV v1/v2. Uses the Vault HTTP API directly — no SDK dependency.

```ts
import { VaultAdapter } from 'nestjs-boot/config/adapters';

const source = new VaultAdapter({
  url: 'http://vault.internal:8200',
  token: process.env.VAULT_TOKEN!,
  path: 'secret/data/my-service',
});
const secrets = await source.load();
```

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | Vault server URL |
| `token` | `string` | Vault token with read access |
| `path` | `string` | Secret path (e.g. `secret/data/my-service`) |

### AwsSecretsAdapter

Loads secrets from AWS Secrets Manager. Requires `@aws-sdk/client-secrets-manager`.

```ts
import { AwsSecretsAdapter } from 'nestjs-boot/config/adapters';

const source = new AwsSecretsAdapter({
  secretId: 'my-service/prod',
  region: 'us-east-1',
});
const secrets = await source.load();
```

| Option | Type | Description |
|--------|------|-------------|
| `secretId` | `string` | ARN or name of the secret |
| `region` | `string` | AWS region |

IAM permission required: `secretsmanager:GetSecretValue` on the target secret ARN.

### Merging multiple sources

```ts
import { mergeConfigs } from 'nestjs-boot/config/config-merger';
import { EnvFileAdapter, VaultAdapter, AwsSecretsAdapter } from 'nestjs-boot/config/adapters';

const merged = await mergeConfigs([
  new EnvFileAdapter('.env'),                    // lowest priority
  new EnvFileAdapter('.env.production'),          // overrides .env
  new VaultAdapter({ url: '...', token: '...', path: '...' }),  // overrides .env.production
]);
// Then process.env overrides everything (handled outside mergeConfigs)
// Then explicit BootOptions passed to createApp() is final authority
```

Deep merge rules: objects are recursively merged, arrays are replaced (not concatenated).

## BootConfigService

Inject `BootConfigService` for typed access to the validated config at runtime.

```ts
import { Injectable } from '@nestjs/common';
import { BootConfigService } from 'nestjs-boot/config';

@Injectable()
export class MyService {
  constructor(private readonly config: BootConfigService) {}

  getDbUri(): string {
    // Dot-notation path with autocomplete
    return this.config.getOrThrow<string>('database.connections.master.writerUri');
  }

  getCacheTtl(): number | undefined {
    // Returns undefined if path doesn't exist
    return this.config.get<number>('cache.defaultTtl');
  }

  getDatabaseConfig() {
    // Typed sub-section access
    return this.config.section('database');
  }

  inspectSchema() {
    // Returns the Joi schema definition for all valid config keys
    return this.config.getSchema();
  }
}
```

### API

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `get<T>(path: string): T \| undefined` | Get value by dot-path. Returns `undefined` if missing |
| `getOrThrow` | `getOrThrow<T>(path: string): T` | Get value or throw if missing |
| `getAll` | `getAll(): Readonly<BootOptions>` | Full validated config object |
| `section` | `section<K>(key: K): BootOptions[K]` | Typed sub-section (e.g. `section('database')`) |
| `getSchema` | `getSchema(): Record<string, unknown>` | Joi schema definition for introspection |

## ConfigWatcher

Dev-only file watcher that logs a restart reminder when `.env` changes. Does **not** hot-reload config (too risky with DI container).

```ts
import { createDevConfigWatcher } from 'nestjs-boot/config/config-watcher';

// main.ts — dev only
if (process.env.NODE_ENV !== 'production') {
  const watcher = createDevConfigWatcher(['.env', `.env.${process.env.NODE_ENV}`]);
  // On shutdown:
  // watcher.stop();
}
```

Throws if called in production. Uses `fs.watch` (no external dependencies). Debounces rapid events (100ms).

## Validation

Config validation uses Joi and runs at boot via `validateBootOptions()`. Validation is `abortEarly: false` — all errors are reported at once.

```
[nestjs-boot] Invalid configuration:
  - writerUri must be a valid MongoDB URI
  - jwt.secret (min 32 chars for HMAC-SHA256) length must be at least 32 characters long
  - Redis url must start with redis:// or rediss://
```

### Key validation rules

| Field | Rule |
|-------|------|
| `database.connections.*.writerUri` | Required, must start with `mongodb://` or `mongodb+srv://` |
| `cache.redis.url` | Must start with `redis://` or `rediss://` |
| `cache.defaultTtl` | Integer >= 1, default 300 |
| `auth.jwt.secret` | Min 32 characters |
| `auth.jwt.refreshSecret` | Min 32 characters (optional) |
| `tracing.exporter` | One of: `otlp`, `jaeger`, `zipkin`, `console` |
| `logging.level` | One of: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `queue.driver` | Must be `bullmq` |
| `tenancy.strategy` | One of: `header`, `subdomain`, `path` |

## Best practices

- **One config object** — keep all infrastructure config in `BootOptions`. Avoid scattering config across multiple modules.
- **Secrets in adapters** — use VaultAdapter or AwsSecretsAdapter for secrets. Do not commit secrets to `.env` files.
- **Validate in CI** — run your app with `NODE_ENV=test` in CI to catch config errors before deploy.
- **Use `section()`** — prefer `config.section('database')` over `config.getAll().database` for cleaner code.

## Common pitfalls

- **dotenv not installed** — `createApp()` silently skips `.env` loading if dotenv is not installed. Install it: `npm install dotenv`.
- **Source order matters** — in `mergeConfigs()`, later sources override earlier ones. Put your most authoritative source last.
- **ConfigWatcher in production** — throws an error. Always guard with `NODE_ENV !== 'production'`.
- **AWS SDK missing** — `AwsSecretsAdapter` throws a clear error if `@aws-sdk/client-secrets-manager` is not installed. It does not silently fall back.

## See also

- [Getting Started](getting-started.md) — minimal setup and boot sequence
- [Production Checklist](production-checklist.md) — config validation in CI and secrets management
