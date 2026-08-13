# Cold Start & Cân nhắc Serverless

## Tóm tắt

**nestjs-boot được thiết kế cho microservice chạy lâu dài (Docker/K8s), không phải FaaS serverless.**

Nếu bạn đang xây dựng cho AWS Lambda, Google Cloud Functions, hoặc bất kỳ runtime invocation-per-request nào, đọc hướng dẫn này trước khi cam kết với nestjs-boot.

---

## Tại sao nestjs-boot KHÔNG được tối ưu cho serverless

`createApp()` khởi tạo eager tất cả module được cấu hình:

```
[boot] Config validation      ~12ms
[boot] OTel init (nếu bật)    ~45–300ms
[boot] NestFactory.create()   ~250–400ms   ← DI container + tất cả module init
[boot] DB connection pool     ~100–500ms   ← Kết nối MongoDB/Postgres
[boot] Redis connect          ~50–200ms
[boot] Transport bind         ~20–100ms
[boot] Tổng                   ~500–1500ms
```

Trên server chạy lâu dài, chi phí khởi động này được phân bổ qua hàng triệu request.
Trên Lambda với cold start mỗi lần gọi, **điều này xảy ra mỗi lần** — kể cả cho workload chỉ xử lý một event mỗi phút.

Benchmark cộng đồng (2024, Lambda 512MB):
- Cold start NestJS: **1.2–1.8s**
- Express (tối giản): 50–150ms
- Hono (Edge-native): <50ms
- Fastify: 80–200ms

---

## Khi nào nên dùng nestjs-boot

nestjs-boot là lựa chọn đúng khi:

- Service chạy dưới dạng container tồn tại lâu (Docker, K8s, ECS, Cloud Run với min-instances >= 1)
- Bạn cần MongoDB + Redis + OTel + Prometheus + gRPC tất cả kết nối tự động
- Team đánh giá cao DX (không boilerplate) hơn latency cold start
- Bạn có traffic ổn định, có thể dự đoán

---

## Khi nào KHÔNG nên dùng nestjs-boot

Cân nhắc lựa chọn thay thế khi:

| Kịch bản | Lựa chọn thay thế đề xuất |
|---|---|
| AWS Lambda nhạy cảm cold start | [Hono](https://hono.dev) hoặc Express thuần |
| Vercel / Netlify Edge Functions | Hono (Edge runtime, không DI Node.js) |
| Google Cloud Functions (min=0) | [Fastify](https://fastify.dev) |
| Xử lý event nhẹ (SQS, SNS) | Handler Node.js thuần với `@nestjs/core` standalone |
| Script/CLI ngắn hạn | Node.js thuần hoặc Commander.js |

---

## Nếu bạn PHẢI dùng nestjs-boot trên Lambda

Nếu team đã cam kết với NestJS DI và cần chạy trên Lambda, đây là các kỹ thuật giảm cold start:

### 1. Bật tùy chọn boot `lazy` (trì hoãn kết nối DB/cache)

```ts
const app = await createApp(AppModule, {
  database: { connections: { master: { writerUri: process.env.MONGO_URI! } } },
  cache: { redis: { url: process.env.REDIS_URL! } },
  lazy: true,  // ← DB và cache kết nối khi dùng lần đầu, không phải lúc boot
});
```

**Đánh đổi:** request đầu tiên chậm hơn (kết nối được thiết lập theo yêu cầu).
Các request tiếp theo trong cùng Lambda instance nhanh (kết nối được tái sử dụng).
Cải thiện cold start: ~40–60% (tiết kiệm 300–800ms).

### 2. Sử dụng `LazyModuleLoader` NestJS cho module nặng tùy chọn

Cho module hiếm khi dùng (ví dụ: báo cáo, xử lý batch):

```ts
import { LazyModuleLoader } from '@nestjs/core';

@Injectable()
export class ReportService {
  constructor(private readonly lazyModuleLoader: LazyModuleLoader) {}

  async generateReport() {
    // ReportModule nặng chỉ load khi gọi lần đầu — không phải lúc bootstrap
    const { ReportModule } = await import('./report/report.module');
    const moduleRef = await this.lazyModuleLoader.load(() => ReportModule);
    const reportGenerator = moduleRef.get(ReportGenerator);
    return reportGenerator.run();
  }
}
```

Xem: https://docs.nestjs.com/fundamentals/lazy-loading-modules

### 3. Sử dụng adapter `@vendia/serverless-express`

```ts
// src/lambda.ts
import { NestFactory } from '@nestjs/core';
import serverlessExpress from '@vendia/serverless-express';
import { AppModule } from './app.module';
import { createApp } from 'nestjs-boot';

let cachedApp: any;

async function bootstrap() {
  if (cachedApp) return cachedApp;
  const app = await createApp(AppModule, {
    lazy: true,  // trì hoãn kết nối
    // ... tùy chọn của bạn
  });
  await app.init();
  cachedApp = serverlessExpress({ app: app.getHttpAdapter().getInstance() });
  return cachedApp;
}

export const handler = async (event: any, context: any) => {
  const app = await bootstrap();
  return app(event, context);
};
```

**Lưu ý:** `@vendia/serverless-express` bọc HTTP adapter NestJS — nó KHÔNG sửa cold start DI. Nó chỉ xử lý chuyển đổi Lambda event sang HTTP request.

### 4. Giữ Lambda ấm

Cho workload có thể dự đoán, dùng EventBridge hoặc CloudWatch rule ping Lambda mỗi 5 phút. Điều này giữ container ấm và tránh cold start cho hầu hết request. Đây không phải fix — là workaround với chi phí.

---

## Profiler thời gian khởi động (dev mode)

nestjs-boot bao gồm startup profiler log thời gian dành cho mỗi giai đoạn `createApp`. Bật trong development để xác định module chậm:

```ts
// src/main.ts
const app = await createApp(AppModule, {
  // ...
});
// Output profiler xuất hiện trong log trước khi app bắt đầu lắng nghe
```

Output mẫu (chỉ dev mode, tắt trong production):
```
[boot] Config validation: 12ms
[boot] OTel init: 45ms
[boot] NestFactory.create: 340ms
[boot] DB connect: 120ms
[boot] Total: 517ms
```

---

## Tổng kết

| nestjs-boot | Service chạy lâu dài | Serverless |
|---|---|---|
| DX (không boilerplate) | Xuất sắc | Chấp nhận được |
| Cold start | Không áp dụng (luôn ấm) | 500–1500ms |
| Cold start với `lazy: true` | Không áp dụng | 200–600ms |
| Phủ sóng hạ tầng | Đầy đủ | Đầy đủ (nhưng lãng phí) |
| Đề xuất | Có | Chỉ khi team đã cam kết NestJS DI |
