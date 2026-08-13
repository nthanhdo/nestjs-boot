# Cấu hình

## Tham chiếu BootOptions

Interface `BootOptions` là config object duy nhất truyền vào `createApp()`. Mọi section đều optional — bỏ qua section nào thì module đó không được load.

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

### Tùy chọn top-level

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `database` | `DatabaseOptions` | — | Kết nối MongoDB (multi-connection, reader/writer split) |
| `cache` | `CacheOptions` | — | Cache đa tầng (L1 memory + L2 Redis) |
| `auth` | `AuthOptions` | — | JWT + API key + RBAC |
| `health` | `HealthOptions` | `{ enabled: true, path: '/health' }` | Health check endpoint |
| `response` | `ResponseOptions` | `{ envelope: false, errorHandler: true }` | Response envelope + error filter |
| `logger` | `boolean \| any` | NestJS default | NestJS logger. Đặt `false` để tắt |
| `logging` | `LoggingOptions` | — | Pino structured logging |
| `metrics` | `MetricsOptions` | — | Prometheus metrics |
| `tracing` | `TracingOptions` | — | OpenTelemetry tracing |
| `transport` | `TransportOptions` | — | Microservice transport |
| `queue` | `QueueOptions` | — | BullMQ job queue |
| `events` | `EventBusOptions` | — | Event bus (memory/Redis) |
| `resilience` | `ResilienceOptions` | — | Circuit breaker + timeout |
| `shutdown` | `ShutdownOptions` | — | Graceful shutdown |
| `correlation` | `object` | — | Correlation ID middleware |
| `interServiceAuth` | `InterServiceAuthOptions` | — | Truyền auth giữa các service |
| `versioning` | `VersioningOptions` | — | API versioning |
| `tenancy` | `TenancyOptions` | — | Multi-tenancy |
| `swagger` | `SwaggerOptions` | — | Tài liệu OpenAPI |
| `websocket` | `WebSocketOptions` | — | WebSocket scaling |
| `webhooks` | `WebhookModuleOptions` | — | Payment webhook |
| `storage` | `StorageModuleOptions` | — | Lưu trữ file |
| `cqrs` | `CqrsOptions` | — | CQRS + Event Sourcing |
| `lazy` | `boolean` | `false` | Trì hoãn kết nối đến request đầu tiên (serverless) |
| `monitoring` | `object` | — | Hook báo lỗi (Sentry, Datadog) |

## File môi trường

`createApp()` tự động load file `.env` bằng dotenv (nếu đã cài):

1. `.env` — config cơ bản (load trước, ưu tiên thấp hơn)
2. `.env.{BOOT_ENV || NODE_ENV}` — ghi đè theo môi trường (load sau, ưu tiên cao hơn)

```bash
# .env
DATABASE_URI=mongodb://localhost:27017/myapp
CACHE_TTL=300

# .env.production
DATABASE_URI=mongodb+srv://prod-cluster/myapp
CACHE_TTL=600
```

`BOOT_ENV` được ưu tiên hơn `NODE_ENV` khi chọn file. Điều này cho phép bạn tách config profile khỏi runtime mode của Node.

## Config adapter

nestjs-boot cung cấp interface `ConfigSource` và ba adapter tích hợp để load config từ nguồn bên ngoài. Các source được merge bằng `mergeConfigs()` — source sau ghi đè source trước.

### Interface ConfigSource

```ts
interface ConfigSource {
  readonly name: string;
  load(): Promise<Record<string, unknown>>;
}
```

### EnvFileAdapter

Load cặp key-value từ file `.env` bằng dotenv.

```ts
import { EnvFileAdapter } from 'nestjs-boot/config/adapters';

const source = new EnvFileAdapter('.env');
const values = await source.load();
// { DATABASE_URI: 'mongodb://...', CACHE_TTL: '300' }
```

### VaultAdapter

Load secret từ HashiCorp Vault KV v1/v2. Sử dụng trực tiếp Vault HTTP API — không cần SDK dependency.

```ts
import { VaultAdapter } from 'nestjs-boot/config/adapters';

const source = new VaultAdapter({
  url: 'http://vault.internal:8200',
  token: process.env.VAULT_TOKEN!,
  path: 'secret/data/my-service',
});
const secrets = await source.load();
```

| Option | Type | Mô tả |
|--------|------|-------------|
| `url` | `string` | URL server Vault |
| `token` | `string` | Vault token có quyền đọc |
| `path` | `string` | Đường dẫn secret (ví dụ `secret/data/my-service`) |

### AwsSecretsAdapter

Load secret từ AWS Secrets Manager. Yêu cầu `@aws-sdk/client-secrets-manager`.

```ts
import { AwsSecretsAdapter } from 'nestjs-boot/config/adapters';

const source = new AwsSecretsAdapter({
  secretId: 'my-service/prod',
  region: 'us-east-1',
});
const secrets = await source.load();
```

| Option | Type | Mô tả |
|--------|------|-------------|
| `secretId` | `string` | ARN hoặc tên của secret |
| `region` | `string` | AWS region |

Quyền IAM cần thiết: `secretsmanager:GetSecretValue` trên ARN secret đích.

### Merge nhiều source

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

Quy tắc deep merge: object được merge đệ quy, array được thay thế (không nối).

## BootConfigService

Inject `BootConfigService` để truy cập config đã validate với kiểu dữ liệu tại runtime.

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

| Method | Signature | Mô tả |
|--------|-----------|-------------|
| `get` | `get<T>(path: string): T \| undefined` | Lấy giá trị theo dot-path. Trả về `undefined` nếu không có |
| `getOrThrow` | `getOrThrow<T>(path: string): T` | Lấy giá trị hoặc throw nếu không có |
| `getAll` | `getAll(): Readonly<BootOptions>` | Toàn bộ config object đã validate |
| `section` | `section<K>(key: K): BootOptions[K]` | Sub-section có kiểu dữ liệu (ví dụ `section('database')`) |
| `getSchema` | `getSchema(): Record<string, unknown>` | Định nghĩa Joi schema để introspect |

## ConfigWatcher

File watcher chỉ dùng cho dev, log nhắc nhở restart khi file `.env` thay đổi. **Không** hot-reload config (quá rủi ro với DI container).

```ts
import { createDevConfigWatcher } from 'nestjs-boot/config/config-watcher';

// main.ts — dev only
if (process.env.NODE_ENV !== 'production') {
  const watcher = createDevConfigWatcher(['.env', `.env.${process.env.NODE_ENV}`]);
  // On shutdown:
  // watcher.stop();
}
```

Throw lỗi nếu gọi trong production. Sử dụng `fs.watch` (không cần dependency bên ngoài). Debounce các event liên tiếp (100ms).

## Validation

Config validation sử dụng Joi và chạy lúc khởi động qua `validateBootOptions()`. Validation dùng `abortEarly: false` — tất cả lỗi được báo cáo cùng lúc.

```
[nestjs-boot] Invalid configuration:
  - writerUri must be a valid MongoDB URI
  - jwt.secret (min 32 chars for HMAC-SHA256) length must be at least 32 characters long
  - Redis url must start with redis:// or rediss://
```

### Các quy tắc validation chính

| Field | Quy tắc |
|-------|------|
| `database.connections.*.writerUri` | Bắt buộc, phải bắt đầu bằng `mongodb://` hoặc `mongodb+srv://` |
| `cache.redis.url` | Phải bắt đầu bằng `redis://` hoặc `rediss://` |
| `cache.defaultTtl` | Số nguyên >= 1, mặc định 300 |
| `auth.jwt.secret` | Tối thiểu 32 ký tự |
| `auth.jwt.refreshSecret` | Tối thiểu 32 ký tự (optional) |
| `tracing.exporter` | Một trong: `otlp`, `jaeger`, `zipkin`, `console` |
| `logging.level` | Một trong: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `queue.driver` | Phải là `bullmq` |
| `tenancy.strategy` | Một trong: `header`, `subdomain`, `path` |

## Best Practices

- **Một config object** — giữ tất cả infrastructure config trong `BootOptions`. Tránh phân tán config qua nhiều module.
- **Secret trong adapter** — dùng VaultAdapter hoặc AwsSecretsAdapter cho secret. Không commit secret vào file `.env`.
- **Validate trong CI** — chạy app với `NODE_ENV=test` trong CI để phát hiện lỗi config trước khi deploy.
- **Dùng `section()`** — ưu tiên `config.section('database')` thay vì `config.getAll().database` cho code gọn hơn.

## Lưu ý quan trọng

- **Chưa cài dotenv** — `createApp()` bỏ qua việc load `.env` một cách im lặng nếu dotenv chưa được cài. Cài đặt: `npm install dotenv`.
- **Thứ tự source quan trọng** — trong `mergeConfigs()`, source sau ghi đè source trước. Đặt source có thẩm quyền cao nhất cuối cùng.
- **ConfigWatcher trong production** — throw lỗi. Luôn kiểm tra `NODE_ENV !== 'production'`.
- **Thiếu AWS SDK** — `AwsSecretsAdapter` throw lỗi rõ ràng nếu `@aws-sdk/client-secrets-manager` chưa được cài. Không fallback im lặng.
