# Bắt đầu

## nestjs-boot là gì?

nestjs-boot là một **runtime package** (không phải boilerplate). Bạn cài đặt nó vào bất kỳ project NestJS nào và gọi `createApp()` với một config object duy nhất. Nó tự động kết nối các infrastructure module — database, cache, auth, health checks, logging, tracing, metrics — dựa trên các section config bạn cung cấp. Bỏ qua một section thì module đó không được load.

## Cài đặt

```bash
npm install nestjs-boot
```

Các peer dependency được load theo nhu cầu. Chỉ cần cài những gì bạn sử dụng:

| Tính năng | Peer dependency |
|---------|----------------|
| Database | `mongoose`, `@nestjs/mongoose` |
| Cache (Redis L2) | `ioredis` |
| Cache (Memcached L1) | `memjs` |
| Auth (JWT) | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` |
| Tracing | `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` |
| Metrics | `prom-client` |
| Logging | `pino`, `pino-http`, `nestjs-pino` |
| Queue | `bullmq` |
| Swagger | `@nestjs/swagger` |
| Validation | `joi` (bắt buộc — dùng để validate config) |

## Ví dụ tối thiểu

```ts
// main.ts
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {});
  await app.listen(3000);
}
bootstrap();
```

Với config rỗng, bạn sẽ có:
- Health endpoint tại `GET /health` (bật mặc định)
- Global exception filter (bật mặc định)
- Bộ quét circular-dependency trong DI ở chế độ dev
- Load file `.env` qua dotenv (nếu đã cài)

## Cấu hình từng bước

### Thêm database

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: 'mongodb://localhost:27017/myapp',
        readerUri: 'mongodb://reader:27017/myapp', // optional
      },
    },
  },
});
```

### Thêm cache

```ts
const app = await createApp(AppModule, {
  database: { /* ... */ },
  cache: {
    redis: { url: 'redis://localhost:6379' },
    defaultTtl: 300,
  },
});
```

### Thêm auth

```ts
const app = await createApp(AppModule, {
  database: { /* ... */ },
  cache: { /* ... */ },
  auth: {
    jwt: {
      secret: 'your-32-char-minimum-secret-key!!',
      signOptions: { expiresIn: '1h' },
    },
  },
});
```

## Trình tự khởi động

Khi bạn gọi `createApp(AppModule, options)`, các bước sau sẽ thực hiện theo thứ tự:

1. **Load file `.env`** — file `.env` cơ bản, sau đó `.env.{BOOT_ENV || NODE_ENV}` (ghi đè)
2. **Validate options** — Joi schema validate toàn bộ config; báo lỗi rõ ràng ngay lập tức
3. **Khởi tạo tracing** — OpenTelemetry SDK patch trước khi NestFactory import module
4. **Xây dựng BootWrappedModule** — tổ hợp các infrastructure module import dựa trên config
5. **Tạo NestJS app** — với thông báo lỗi DI dễ đọc (human-readable resolution failures)
6. **Bật API versioning** — nếu có config `versioning`
7. **Quét circular dependency** — chỉ ở chế độ dev, cảnh báo không chặn
8. **Thiết lập app logger** — pino structured logger nếu có config `logging`
9. **Áp dụng globals** — interceptor (response envelope, timeout, metrics, logging) và filter
10. **Kết nối transport** — gRPC, TCP, NATS, RabbitMQ microservice listener
11. **Bật shutdown hook** — nếu có config `shutdown`
12. **Kiểm tra layer** — validate hướng import khi khởi động (opt-in)
13. **Log tóm tắt config** — tóm tắt đã sanitize ở chế độ dev
14. **Thiết lập Swagger** — OpenAPI docs nếu có config `swagger`

## Tổng quan các tùy chọn cấu hình

| Section | Chức năng |
|---------|----------------|
| `database` | MongoDB multi-connection với reader/writer split |
| `cache` | Cache đa tầng (L1 memory + L2 Redis) |
| `auth` | JWT + API key + RBAC |
| `health` | Health check endpoint (mặc định: bật) |
| `response` | Response envelope + global error handler |
| `logging` | Pino structured logging |
| `metrics` | Prometheus metrics endpoint |
| `tracing` | OpenTelemetry distributed tracing |
| `transport` | gRPC, TCP, NATS, RabbitMQ microservice |
| `queue` | BullMQ job queue |
| `events` | Event bus (memory hoặc Redis pub/sub) |
| `versioning` | API versioning (URI, header, hoặc media-type) |
| `tenancy` | Multi-tenancy (header, subdomain, hoặc path) |
| `swagger` | Tài liệu OpenAPI |
| `websocket` | WebSocket với Redis scaling |
| `cqrs` | CQRS + Event Sourcing |
| `storage` | Lưu trữ file (local, S3, GCS) |
| `webhooks` | Xử lý payment webhook (Stripe, PayPal) |
| `lazy` | Tối ưu cold-start cho serverless |

## Best Practices

- **Bắt đầu tối thiểu** — thêm config section khi cần. Section không dùng tốn zero chi phí.
- **Dùng file `.env`** — `createApp` tự động load `.env` và `.env.{NODE_ENV}`. Không cần setup thêm.
- **Validate sớm** — config validation chạy lúc khởi động. Sửa lỗi trước khi app chạy, không phải lúc runtime.
- **Dùng `BOOT_ENV`** — nếu bạn cần config profile khác với `NODE_ENV`, đặt `BOOT_ENV`.

## Lưu ý quan trọng

- **JWT secret quá ngắn** — phải ít nhất 32 ký tự (HMAC-SHA256 minimum). Validation sẽ từ chối giá trị ngắn hơn.
- **Thiếu peer dependency** — nestjs-boot load peer theo nhu cầu. Nếu bạn cấu hình `cache.redis` mà không cài `ioredis`, nó fallback sang L1 only với cảnh báo.
- **Định dạng MongoDB URI** — `writerUri` phải bắt đầu bằng `mongodb://` hoặc `mongodb+srv://`. Validation từ chối các format khác.
- **Định dạng Redis URI** — phải bắt đầu bằng `redis://` hoặc `rediss://`.
