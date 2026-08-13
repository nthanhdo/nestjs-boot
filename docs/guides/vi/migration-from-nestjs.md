# Chuyển đổi từ NestJS thuần sang nestjs-boot

Hướng dẫn này giúp bạn áp dụng nestjs-boot vào dự án NestJS hiện có.
Mỗi giai đoạn độc lập — chỉ áp dụng những gì bạn cần, theo bất kỳ thứ tự nào.

---

## Giai đoạn 1: Cài đặt + Wrapper createApp

Thay thế `NestFactory.create` bằng `createApp` của nestjs-boot. Các module hiện tại của bạn không thay đổi.

```bash
npm install nestjs-boot
```

**Trước:**
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

**Sau:**
```ts
// main.ts
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {
    // Config trống — tất cả module opt-in. AppModule của bạn hoạt động như cũ.
    health: { path: '/health' },
    shutdown: {},
  });
  await app.listen(3000);
}
bootstrap();
```

`createApp` bọc `AppModule` của bạn với các module hạ tầng dựa trên đối tượng config.
Key bị bỏ qua = module không được load. Các provider, controller, và import hiện tại của bạn không thay đổi.

**Bạn nhận được ngay:** endpoint health, tắt máy duyên dáng, thông báo lỗi DI có cấu trúc,
và load file `.env` / `.env.{NODE_ENV}` (nếu `dotenv` đã cài).

---

## Giai đoạn 2: Chuyển đổi kết nối Database

Thay thế setup Mongoose tùy chỉnh bằng `BootOptions.database`.

**Trước:**
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

**Sau:**
```ts
// main.ts — thêm database vào BootOptions
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: process.env.MONGO_URI,
        readerUri: process.env.MONGO_READER_URI, // read replica tùy chọn
        options: { maxPoolSize: 20 },
      },
    },
  },
});
```

Xóa `MongooseModule.forRoot()` khỏi `AppModule`. Giữ `MongooseModule.forFeature()` cho schema.
nestjs-boot đăng ký connection theo tên — inject qua `@InjectConnection('master')`.

**Đa database:** Thêm key vào `connections` cho database riêng biệt (ví dụ: `analytics`, `logs`).

---

## Giai đoạn 3: Thay Auth tùy chỉnh bằng AuthModule

Thay thế JWT guard và strategy tự viết bằng `AuthModule` của nestjs-boot.

**Trước:**
```ts
// auth.module.ts — 60+ dòng JwtModule, PassportModule, strategy, guard
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

**Sau:**
```ts
// main.ts — thêm auth vào BootOptions
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

Xóa `AuthModule`, `JwtStrategy`, `JwtAuthGuard`, và `RolesGuard` tùy chỉnh.
Sử dụng decorator `@Auth()` và `@Roles('admin')` tích hợp sẵn trên controller.

**Auth API key** có thể được thêm song song JWT:
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

## Giai đoạn 4: Thêm tầng Cache

Thay thế setup Redis + in-memory thủ công bằng cache hai lớp tích hợp sẵn.

**Trước:**
```ts
// cache.module.ts
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [CacheModule.register({ store: redisStore, url: process.env.REDIS_URL, ttl: 300 })],
})
export class AppCacheModule {}
```

**Sau:**
```ts
// main.ts — thêm cache vào BootOptions
const app = await createApp(AppModule, {
  cache: {
    redis: { url: process.env.REDIS_URL },
    defaultTtl: 300,
  },
});
```

Xóa module cache tùy chỉnh. Inject `CacheService` từ nestjs-boot.
L1 (LRU in-memory) xử lý key nóng; L2 (Redis) là lớp chia sẻ. Cả hai đều minh bạch.

---

## Giai đoạn 5: Thêm Observability

Thay thế setup logging, metric, và tracing rải rác bằng cấu hình thống nhất.

**Trước:**
```ts
// main.ts — pino thủ công, prom-client, khởi tạo OpenTelemetry SDK (100+ dòng qua 3 file)
import pino from 'pino';
const logger = pino({ level: 'info' });
// ... prometheus registry, endpoint /metrics, OTel NodeSDK...
```

**Sau:**
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

Xóa logger factory tùy chỉnh, middleware metric, và file khởi tạo tracing.
Mỗi dòng log có `correlationId`; mỗi HTTP request có Prometheus histogram +
OTel span — tự động.

---

## Giai đoạn 6: Thêm Pattern khả năng phục hồi

Thay thế vòng lặp retry tự viết và middleware timeout bằng cấu hình khai báo + decorator.

**Trước:**
```ts
// retry.helper.ts — 40 dòng logic exponential backoff
async function withRetry(fn, maxAttempts = 3) { /* ... */ }

// timeout.middleware.ts
app.use((req, res, next) => {
  req.setTimeout(30000, () => res.status(408).end());
  next();
});
```

**Sau:**
```ts
// main.ts — thêm resilience vào BootOptions
const app = await createApp(AppModule, {
  resilience: {
    circuitBreaker: { failureThreshold: 5, resetTimeout: 30000 },
    timeout: { default: 10000 },
  },
});
```

Sử dụng decorator trên phương thức riêng lẻ để kiểm soát chi tiết:
```ts
@CircuitBreaker({ failureThreshold: 3 })
@Retry({ maxAttempts: 3, backoff: 'exponential' })
@Timeout(5000)
async callExternalApi() { /* ... */ }
```

Xóa helper retry tùy chỉnh và middleware timeout.

---

## Những gì bạn có thể bỏ qua

Mỗi module nestjs-boot đều opt-in. Bỏ qua key config thì module không được load.

| Module | Bỏ qua nếu... |
|--------|-----------|
| `database` | Bạn tự quản lý kết nối Mongoose/TypeORM |
| `cache` | Bạn không cần cache hoặc dùng thư viện khác |
| `auth` | Bạn có hệ thống auth tùy chỉnh muốn giữ |
| `tracing` | Bạn không dùng OpenTelemetry |
| `metrics` | Bạn không dùng Prometheus |
| `queue` | Bạn không dùng BullMQ |
| `transport` | Service chỉ HTTP (không gRPC/TCP/NATS/RMQ) |
| `tenancy` | Ứng dụng single-tenant |
| `webhooks` | Không cần xử lý webhook thanh toán |
| `storage` | Không cần upload/download file |
| `cqrs` | Không cần event sourcing |

---

## Cạm bẫy chuyển đổi phổ biến

**1. Đăng ký module trùng** — Nếu bạn thêm `database` vào BootOptions nhưng vẫn giữ
`MongooseModule.forRoot()` trong `AppModule`, bạn sẽ có hai connection pool. Xóa
import cũ khi chuyển đổi mỗi module.

**2. Quên `rawBody: true` cho webhook** — Xác minh chữ ký Stripe/PayPal cần
raw request body. Nếu bạn dùng module `webhooks`, đảm bảo NestFactory hoặc createApp
của bạn truyền `{ rawBody: true }` cho Express adapter bên dưới.

**3. Thứ tự khởi tạo tracing** — OTel SDK phải patch `http`/`express` trước khi NestJS import chúng.
`createApp` xử lý việc này tự động (bước 2 trong chuỗi bootstrap). Nếu bạn gọi
`initTracing` thủ công, gọi nó trước `NestFactory.create`.

**4. Đăng ký shutdown hook hai lần** — `createApp` gọi `app.enableShutdownHooks()` khi
`shutdown` được đặt. Đừng gọi lại trong hàm bootstrap.

**5. Xung đột load `.env`** — `createApp` tự động load `.env` và `.env.{NODE_ENV}`
(nếu `dotenv` đã cài). Nếu bạn có lời gọi `dotenv.config()` riêng, xóa nó để tránh
load trùng với hành vi override khác nhau.

**6. Thay thế Logger** — Khi `logging` được đặt, nestjs-boot thay thế NestJS logger bằng
`BootLogger` (dựa trên pino). Provider `Logger` tùy chỉnh trong app có thể xung đột. Xóa chúng
hoặc giữ `logging` không đặt.
