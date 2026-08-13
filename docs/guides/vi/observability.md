# Khả năng quan sát (Observability)

nestjs-boot cung cấp bốn trụ cột quan sát tích hợp: distributed tracing (OpenTelemetry), Prometheus metrics, structured logging (pino), và correlation ID cho request. Cả bốn đều là tùy chọn kích hoạt với fallback no-op khi thiếu peer dependency.

## Correlation ID

Tầng nền tảng. Gán ID duy nhất cho mỗi request và lan truyền qua log, trace, và service hạ nguồn qua AsyncLocalStorage.

### Cài đặt

```ts
import { CorrelationModule } from 'nestjs-boot/correlation';

@Module({
  imports: [
    CorrelationModule.register({
      header: 'X-Correlation-Id',  // mặc định
      generator: () => crypto.randomUUID(), // mặc định
    }),
  ],
})
export class AppModule {}
```

Middleware đọc `X-Correlation-Id` từ request đến (hoặc tạo mới), lưu vào AsyncLocalStorage, và đặt lên response header.

### Đọc Correlation ID

```ts
import { getCorrelationId } from 'nestjs-boot/correlation';

// Bất kỳ đâu trong code trong một request:
const id = getCorrelationId(); // string | undefined
```

Cho ngữ cảnh lập trình (background job, test):

```ts
import { runWithCorrelationId } from 'nestjs-boot/correlation';

runWithCorrelationId('job-abc-123', () => {
  // getCorrelationId() trả về 'job-abc-123' ở đây
  processJob();
});
```

### W3C Traceparent

Middleware tự động trích xuất header `traceparent` và đưa vào ngữ cảnh lan truyền OpenTelemetry khi `@opentelemetry/api` đã được cài. Truy cập bằng:

```ts
import { getTraceparent } from 'nestjs-boot/correlation';
```

### Response Header Interceptor

`CorrelationInterceptor` gắn correlation ID vào response HTTP và cung cấp helper cho lời gọi RPC đi:

```ts
import { CorrelationInterceptor, withCorrelationId } from 'nestjs-boot/correlation';

// Đăng ký toàn cục
app.useGlobalInterceptors(new CorrelationInterceptor());

// Trong service gọi microservice khác:
const metadata = withCorrelationId({});
this.client.send('pattern', { data, metadata });
```

## Distributed Tracing (OpenTelemetry)

### Cài đặt dependency

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-trace-base
# Chọn một exporter:
npm install @opentelemetry/exporter-trace-otlp-http   # OTLP (Grafana Tempo, v.v.)
npm install @opentelemetry/exporter-jaeger             # Jaeger
npm install @opentelemetry/exporter-zipkin             # Zipkin
# Tùy chọn auto-instrumentation:
npm install @opentelemetry/auto-instrumentations-node
```

### Khởi tạo

`initTracing()` phải được gọi **trước** `NestFactory.create()` để OTel SDK có thể patch các module HTTP/gRPC/DB tại thời điểm import:

```ts
import { initTracing } from 'nestjs-boot/tracing';

initTracing({
  exporter: 'otlp',
  endpoint: 'http://localhost:4318/v1/traces',
  serviceName: 'order-service',
  sampleRate: 0.1, // 10% trong production
});

const app = await NestFactory.create(AppModule);
```

Nếu bạn dùng `createApp()`, việc khởi tạo tracing được xử lý tự động.

Đăng ký TracingModule để TracingService có thể inject:

```ts
import { TracingModule } from 'nestjs-boot/tracing';

@Module({
  imports: [TracingModule.register()],
})
export class AppModule {}
```

### Decorator @BootTrace

Tự động bọc phương thức trong một OpenTelemetry span:

```ts
import { BootTrace } from 'nestjs-boot/tracing';

@Injectable()
export class ProductService {
  @BootTrace('ProductService.findById')
  async findById(id: string) {
    return this.repo.findById(id);
  }

  @BootTrace() // tự động tạo tên: "ProductService.findAll"
  async findAll() { ... }
}
```

Decorator tự động gắn correlation ID dưới dạng span attribute, ghi nhận exception, và đặt trạng thái lỗi khi thất bại. Nếu `@opentelemetry/api` chưa được cài, decorator là no-op.

### TracingService (Span thủ công)

Cho kiểm soát chi tiết hơn:

```ts
import { TracingService } from 'nestjs-boot/tracing';

@Injectable()
export class PaymentService {
  constructor(private readonly tracing: TracingService) {}

  async charge(amount: number) {
    return this.tracing.startSpan('PaymentService.charge', async (span) => {
      span?.setAttribute('payment.amount', amount);
      return this.gateway.charge(amount);
    });

    // Các helper khác:
    this.tracing.addAttribute('key', 'value'); // thêm vào span hiện tại
    this.tracing.recordException(new Error('fail')); // ghi nhận lên span hiện tại
    const span = this.tracing.getActiveSpan(); // lấy span hiện tại
  }
}
```

### Tùy chọn Exporter

| Exporter | Package | Ví dụ Endpoint |
|----------|---------|------------------|
| `'otlp'` | `@opentelemetry/exporter-trace-otlp-http` | `http://localhost:4318/v1/traces` |
| `'jaeger'` | `@opentelemetry/exporter-jaeger` | `http://localhost:14268/api/traces` |
| `'zipkin'` | `@opentelemetry/exporter-zipkin` | `http://localhost:9411/api/v2/spans` |
| `'console'` | `@opentelemetry/sdk-trace-base` | (không, in ra stdout) |

## Prometheus Metrics

### Cài đặt dependency

```bash
npm install prom-client
```

### Cài đặt

```ts
import { MetricsModule } from 'nestjs-boot/metrics';

@Module({
  imports: [
    MetricsModule.register({
      enabled: true,
      path: '/metrics',     // endpoint để Prometheus scrape
      prefix: 'myapp_',     // tiền tố tất cả tên metric
      defaultMetrics: true,  // thu thập metric tiến trình Node.js
    }),
  ],
})
export class AppModule {}
```

Endpoint `GET /metrics` trả về định dạng text Prometheus.

### Tạo Metric tùy chỉnh

```ts
import { MetricsService } from 'nestjs-boot/metrics';

@Injectable()
export class OrderService {
  private readonly orderCounter;
  private readonly latencyHistogram;
  private readonly activeOrders;

  constructor(private readonly metrics: MetricsService) {
    this.orderCounter = metrics.counter(
      'orders_total', 'Total orders placed', ['status'],
    );
    this.latencyHistogram = metrics.histogram(
      'order_processing_seconds', 'Order processing duration',
      [0.1, 0.5, 1, 2.5, 5, 10], ['type'],
    );
    this.activeOrders = metrics.gauge(
      'active_orders', 'Currently active orders', ['region'],
    );
  }

  async placeOrder(order: Order) {
    const end = this.latencyHistogram.startTimer({ type: order.type });
    try {
      await this.process(order);
      this.orderCounter.inc({ status: 'success' });
    } catch {
      this.orderCounter.inc({ status: 'error' });
      throw err;
    } finally {
      end();
    }
  }
}
```

### Interceptor có sẵn

**HttpMetricsInterceptor** ghi nhận `http_request_duration_seconds` và `http_requests_total` với label method, route, và status_code:

```ts
import { HttpMetricsInterceptor } from 'nestjs-boot/metrics';

app.useGlobalInterceptors(app.get(HttpMetricsInterceptor));
```

**DbMetricsInterceptor** ghi nhận `boot_db_query_duration_seconds` và `boot_db_query_total`. Dùng như interceptor hoặc bọc thao tác thủ công:

```ts
import { DbMetricsInterceptor } from 'nestjs-boot/metrics';

// Như interceptor trên controller
@UseInterceptors(DbMetricsInterceptor)

// Hoặc như Mongoose plugin cho instrumentation tự động
import mongoose from 'mongoose';
const plugin = DbMetricsInterceptor.mongoosePlugin(metricsService);
mongoose.plugin(plugin);
```

**CacheMetricsInterceptor** ghi nhận `boot_cache_hit_total`, `boot_cache_miss_total`, và `boot_cache_operation_duration_seconds`:

```ts
import { CacheMetricsInterceptor } from 'nestjs-boot/metrics';

const cacheMetrics = new CacheMetricsInterceptor(metricsService);
const value = await cacheMetrics.wrapGet('l1', () => redis.get(key));
await cacheMetrics.wrapSet('l2', () => redis.set(key, value));
```

**QueueMetrics** ghi nhận `boot_queue_jobs_total`, `boot_queue_job_duration_seconds`, và `boot_queue_depth`:

```ts
import { QueueMetrics } from 'nestjs-boot/metrics';

const queueMetrics = app.get(QueueMetrics);
const result = await queueMetrics.wrapJob('email', () => processJob(data));
queueMetrics.setDepth('email', await myQueue.count());
```

## Structured Logging (Pino)

### Cài đặt dependency

```bash
npm install pino
npm install pino-pretty  # tùy chọn, cho hiển thị đẹp khi phát triển
```

### Cài đặt

```ts
import { LoggingModule } from 'nestjs-boot/logging';
import { BootLogger } from 'nestjs-boot/logging';

@Module({
  imports: [
    LoggingModule.register({
      level: 'info',
      pretty: true,            // tự động tắt trong production
      redact: ['req.headers.authorization', 'password'],
      context: { region: 'us-east-1', team: 'platform' },
    }),
  ],
})
export class AppModule {}

// Dùng làm NestJS logger:
const app = await NestFactory.create(AppModule, {
  logger: app.get(BootLogger),
});
```

### Ngữ cảnh tự động

Mỗi dòng log tự động bao gồm:

| Trường | Nguồn |
|-------|--------|
| `service` | Biến môi trường `OTEL_SERVICE_NAME`, hoặc `name` trong `package.json` |
| `environment` | `NODE_ENV` |
| `version` | Biến môi trường `APP_VERSION`, hoặc `version` trong `package.json` |
| `correlationId` | AsyncLocalStorage (từ CorrelationModule) |
| `traceId` | OpenTelemetry active span (nếu có) |

Các trường tĩnh tùy chỉnh từ tùy chọn `context` được merge vào mỗi dòng log.

### LoggingInterceptor

Ghi log request/response HTTP với thời gian và correlation ID:

```ts
import { LoggingInterceptor } from 'nestjs-boot/logging';

app.useGlobalInterceptors(app.get(LoggingInterceptor));
// Output: → GET /api/products [abc-123] ua="Mozilla/5.0..."
//         ← GET /api/products 200 45ms [abc-123]
```

## Thực hành tốt

- Đăng ký module theo thứ tự: `CorrelationModule` trước, sau đó `TracingModule`, rồi `LoggingModule`, cuối cùng `MetricsModule`. Correlation ID tự động chảy vào trace và log.
- Gọi `initTracing()` trước `NestFactory.create()`. Framework sẽ cảnh báo nếu thứ tự này bị vi phạm.
- Cả bốn module đều graceful degrade khi thiếu peer dependency. `MetricsService` trả về metric stub no-op, các phương thức `TracingService` là no-op, `BootLogger` fallback sang `console`, và correlation storage vẫn hoạt động.
- Dùng tùy chọn prefix của `prom-client` để phân vùng metric theo service, tránh xung đột trong Prometheus instance chia sẻ.
- Đặt `sampleRate` là `0.1` hoặc thấp hơn trong production để kiểm soát lượng trace và chi phí.
- Dùng `redact` trong LoggingModule để ngăn dữ liệu nhạy cảm (token, mật khẩu) xuất hiện trong log.
