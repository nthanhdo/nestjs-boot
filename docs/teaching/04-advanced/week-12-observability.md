# Tuần 12: Observability — Metrics, Logging, Tracing

> **Stage 3 — Advanced | nestjs-boot Teaching Series**
> Yêu cầu: Đã học Tuần 9-11. Đây là bài cuối Stage 3 — MILESTONE 3

---

## Mục tiêu học tập

Sau bài này, sinh viên có thể:
- Giải thích 3 pillars of Observability: Metrics, Logs, Traces
- Phân biệt Counter, Gauge, Histogram, Summary và biết khi nào dùng cái nào
- Setup Prometheus + Grafana bằng docker-compose
- Implement structured logging với Pino qua nestjs-boot BootLogger
- Setup distributed tracing với OpenTelemetry
- Áp dụng RED method để chọn metrics cần monitor
- Tạo dashboard và alert cơ bản

---

## 1. Ba Pillars of Observability

### 1.1 Định nghĩa

```
Observability = khả năng hiểu trạng thái nội bộ của hệ thống
                chỉ bằng cách quan sát output của nó

3 Pillars:

METRICS (WHAT is happening)
→ Con số, aggregated, theo thời gian
→ "Có bao nhiêu request/giây? Error rate là bao nhiêu?"

LOGS (WHY it happened)
→ Records sự kiện cụ thể, có context
→ "Request từ user X lúc 14:32 fail vì invalid token"

TRACES (WHERE in the system)
→ Theo dõi 1 request qua nhiều services
→ "Request mất 500ms: 50ms ở API Gateway, 400ms ở DB query trong Order Service"
```

### 1.2 Khi nào dùng cái nào?

```
Scenario 1: Dashboard báo error rate tăng đột ngột
  → METRICS: "Error rate từ 0.1% lên 5% lúc 14:30"

Scenario 2: Tại sao lại tăng? Lỗi gì?
  → LOGS: Search logs lúc 14:30 → "NullPointerException in PaymentService"

Scenario 3: Tại sao PaymentService fail? Nó gọi gì?
  → TRACES: Theo dõi trace → PaymentService gọi DB mất 2s (timeout)
```

### 1.3 Analogy: Bệnh viện

```
METRICS = Vital signs monitor
  → Nhịp tim: 120 bpm (cao hơn bình thường!)
  → Huyết áp: 160/100 (nguy hiểm!)
  → Không biết tại sao, chỉ biết CÓ VẤN ĐỀ

LOGS = Bệnh án
  → "14:32 Bệnh nhân than đau ngực"
  → "14:35 ECG bất thường"
  → "14:40 Chỉ định thêm xét nghiệm"
  → Chi tiết TỪNG SỰ KIỆN

TRACES = X-ray/MRI
  → "Mạch vành phải bị tắc 80%"
  → Thấy được TOÀN BỘ HỆ THỐNG, không chỉ triệu chứng bề mặt
```

---

## 2. Metrics với Prometheus

### 2.1 4 loại metrics

**Counter** — chỉ tăng, không giảm:
```
Dùng khi: đếm số lần xảy ra
Ví dụ: Total requests, Total errors, Total users registered

http_requests_total{method="POST", status="200"} 1234
http_requests_total{method="GET",  status="404"} 56

→ Tốc độ tăng = rate → "Bao nhiêu request/giây?"
   rate(http_requests_total[5m]) = X requests/giây
```

**Gauge** — tăng và giảm:
```
Dùng khi: đo giá trị hiện tại
Ví dụ: Số connections hiện tại, Memory usage, Queue size

active_connections 127
memory_used_bytes 1073741824
queue_depth{name="email"} 342

→ "Đang có bao nhiêu connections?"
```

**Histogram** — phân phối giá trị:
```
Dùng khi: đo duration/size, cần biết percentiles
Ví dụ: Request latency, Response size

http_request_duration_seconds_bucket{le="0.1"}  890   ← 890 requests < 100ms
http_request_duration_seconds_bucket{le="0.5"}  970   ← 970 requests < 500ms
http_request_duration_seconds_bucket{le="1.0"}  999   ← 999 requests < 1s
http_request_duration_seconds_bucket{le="+Inf"} 1000  ← Tổng 1000 requests

→ "P99 latency = bao nhiêu?" (99% requests hoàn thành trong X ms)
   histogram_quantile(0.99, http_request_duration_seconds_bucket) = 0.95s
```

**Summary** — similar histogram nhưng tính percentile ở client:
```
Dùng khi: Cần accuracy cao cho 1 service (không aggregate nhiều instances)
Ít dùng hơn Histogram trong thực tế

→ Histogram tốt hơn trong distributed systems vì có thể aggregate
```

### 2.2 RED Method — 3 metrics PHẢI có cho mọi service

```
R — Rate:         Bao nhiêu requests/giây đang được xử lý?
E — Errors:       Tỷ lệ requests fail là bao nhiêu?
D — Duration:     Mỗi request mất bao lâu?

Đây là minimum viable monitoring cho bất kỳ service nào.
Nếu không biết monitor gì → bắt đầu với RED.
```

### 2.3 nestjs-boot MetricsModule

File: `src/metrics/metrics.module.ts`, `src/metrics/metrics.service.ts`

```typescript
// app.module.ts
import { MetricsModule } from 'nestjs-boot';

@Module({
  imports: [
    MetricsModule.register({
      enabled: true,
      defaultMetrics: true,    // Node.js metrics: CPU, memory, event loop lag
      path: '/metrics',        // Prometheus scrape endpoint
      prefix: 'myapp_',        // Prefix cho tất cả metrics: myapp_http_requests_total
    }),
  ],
})
export class AppModule {}
```

**HttpMetricsInterceptor** tự động track mọi HTTP request:
```typescript
// Tự động expose:
// myapp_http_requests_total{method, route, status}
// myapp_http_request_duration_seconds{method, route, status}

// Đăng ký global
app.useGlobalInterceptors(app.get(HttpMetricsInterceptor));
```

**Custom metrics:**
```typescript
// order.service.ts
import { MetricsService } from 'nestjs-boot';

@Injectable()
export class OrderService {
  private ordersCreated: any;
  private orderTotal: any;
  private checkoutDuration: any;

  constructor(private readonly metrics: MetricsService) {
    // Counter: đếm số orders
    this.ordersCreated = this.metrics.counter(
      'orders_created_total',
      'Total number of orders created',
      ['status', 'payment_method'],
    );

    // Gauge: tổng revenue hôm nay
    this.orderTotal = this.metrics.gauge(
      'orders_revenue_today',
      'Total revenue today in USD',
    );

    // Histogram: thời gian checkout
    this.checkoutDuration = this.metrics.histogram(
      'checkout_duration_seconds',
      'Time taken to complete checkout',
      ['payment_method'],
    );
  }

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const timer = this.checkoutDuration.labels(dto.paymentMethod).startTimer();

    try {
      const order = await this.processOrder(dto);

      this.ordersCreated.labels('success', dto.paymentMethod).inc();
      this.orderTotal.inc(order.total);

      timer(); // stop timer → records duration
      return order;

    } catch (error) {
      this.ordersCreated.labels('failed', dto.paymentMethod).inc();
      timer();
      throw error;
    }
  }
}
```

**Queue Metrics:**
```typescript
// queue-metrics.ts — track BullMQ job states
import { QueueMetrics } from 'nestjs-boot';

const queueMetrics = new QueueMetrics(metricsService, 'email');
queueMetrics.trackJob('completed');  // Increment completed counter
queueMetrics.trackJob('failed');     // Increment failed counter
queueMetrics.observeDuration(1.5);  // Record 1.5s processing time
```

---

## 3. Structured Logging với Pino

### 3.1 Tại sao structured logging?

```
PLAIN TEXT LOG (tệ):
[2026-08-14 14:32:01] ERROR Order creation failed for user alice@example.com: Invalid payment method BITCOIN

→ Không thể filter theo user
→ Không thể filter theo error type
→ Không thể count bằng script
→ Không machine-parseable

JSON STRUCTURED LOG (tốt):
{
  "level": "error",
  "time": "2026-08-14T14:32:01.123Z",
  "correlationId": "req-abc-123",
  "userId": "user-456",
  "service": "order-service",
  "msg": "Order creation failed",
  "error": "InvalidPaymentMethod",
  "paymentMethod": "BITCOIN",
  "orderTotal": 99.99
}

→ Có thể filter: level=error AND paymentMethod=BITCOIN
→ Có thể count: errors per user per payment method
→ Có thể correlate: cùng correlationId → cùng request
→ Elasticsearch/Loki tự động index mọi field
```

### 3.2 nestjs-boot BootLogger

File: `src/logging/boot-logger.ts`, `src/logging/log-context.ts`

BootLogger sử dụng **Pino** (nhanh nhất trong các Node.js loggers) với auto-injection `correlationId` từ AsyncLocalStorage.

```typescript
// main.ts — dùng BootLogger thay vì NestJS default logger
import { BootLogger } from 'nestjs-boot';

const app = await NestFactory.create(AppModule, {
  logger: new BootLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    pretty: process.env.NODE_ENV !== 'production',  // Pretty print trong dev
    redact: ['password', 'creditCard', 'ssn'],       // Ẩn sensitive fields
    context: {
      service: 'order-service',
      version: process.env.APP_VERSION,
      environment: process.env.NODE_ENV,
    },
  }),
});
```

```typescript
// Sử dụng trong service
import { Logger } from '@nestjs/common';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // Log tự động có correlationId từ AsyncLocalStorage
    this.logger.log('Creating order', {
      customerId: dto.customerId,
      itemCount: dto.items.length,
      total: dto.total,
    });

    try {
      const order = await this.processOrder(dto);

      this.logger.log('Order created successfully', { orderId: order.id });
      return order;

    } catch (error) {
      // Error log với context đầy đủ
      this.logger.error('Order creation failed', {
        customerId: dto.customerId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
```

**Output trong production (JSON):**
```json
{"level":"info","time":"2026-08-14T14:32:01.123Z","correlationId":"req-abc-123","service":"order-service","context":"OrderService","msg":"Creating order","customerId":"user-456","itemCount":3,"total":99.99}
{"level":"error","time":"2026-08-14T14:32:01.456Z","correlationId":"req-abc-123","service":"order-service","context":"OrderService","msg":"Order creation failed","customerId":"user-456","error":"Insufficient inventory"}
```

**Output trong development (pretty):**
```
[14:32:01.123] INFO  (OrderService): Creating order
    customerId: "user-456"
    itemCount: 3
    total: 99.99
    correlationId: "req-abc-123"
```

### 3.3 Log Levels — dùng đúng level

```
FATAL  → Hệ thống sắp crash, cần immediate action
ERROR  → Lỗi xảy ra, nhưng hệ thống vẫn chạy. Cần investigate
WARN   → Không phải lỗi nhưng có vấn đề tiềm ẩn
INFO   → Sự kiện bình thường, nhưng quan trọng (startup, request handled)
DEBUG  → Chi tiết debugging, chỉ enable trong development
TRACE  → Cực kỳ chi tiết (từng function call), gần như không dùng production

Production: INFO và trên
Development: DEBUG và trên
```

### 3.4 LoggingInterceptor

File: `src/logging/logging.interceptor.ts`

```typescript
// Tự động log mọi HTTP request/response
app.useGlobalInterceptors(app.get(LoggingInterceptor));

// Output:
// {"msg":"→ POST /orders","correlationId":"...","method":"POST","path":"/orders"}
// {"msg":"← POST /orders 201 [143ms]","correlationId":"...","statusCode":201,"duration":143}
```

---

## 4. Distributed Tracing với OpenTelemetry

### 4.1 Vấn đề cần Distributed Tracing

```
User báo: "Checkout của tôi mất 3 giây!"

Logs của API Gateway: "POST /checkout 3002ms" ← Biết tổng thời gian
Logs của Order Service: "Order created 150ms"
Logs của Payment Service: "Payment charged 200ms"
Logs của Inventory Service: "Stock reserved ??? ms"

→ 150ms + 200ms = 350ms, còn 2650ms ở đâu?
→ Không biết! Cần Distributed Tracing!
```

### 4.2 Cách Distributed Tracing hoạt động

```
Trace ID: abc-123 (unique per request)
├─ Span: API Gateway [0ms → 3002ms]           ← Root span
│   ├─ Span: Auth Service call [10ms → 45ms]
│   ├─ Span: Order Service gRPC [50ms → 3000ms]
│   │   ├─ Span: DB query [52ms → 2800ms]     ← ĐÂY RỒI! Query chậm!
│   │   │   └─ Collection: orders, op: findOne (no index!)
│   │   └─ Span: EventBus emit [2801ms → 2900ms]
│   └─ Span: Response serialize [3001ms → 3002ms]

→ Ngay lập tức thấy: DB query order service mất 2748ms
→ Missing index trên orders.customer_id!
```

### 4.3 Concepts

```
TRACE = Một request end-to-end qua tất cả services
SPAN  = Một đơn vị công việc trong trace (1 function, 1 DB query, 1 HTTP call)
CONTEXT PROPAGATION = Forward trace ID qua HTTP headers giữa các services

W3C Traceparent header:
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              │  ├── Trace ID (128-bit)                  ├─ Span ID  └─ Flags
              └─ Version
```

### 4.4 OpenTelemetry — Standard cho Distributed Tracing

OpenTelemetry (OTel) = vendor-neutral framework. Implement 1 lần, export ra Jaeger, Zipkin, Datadog, etc.

### 4.5 nestjs-boot TracingModule

File: `src/tracing/init-tracing.ts`, `src/tracing/tracing.module.ts`, `src/tracing/tracing.service.ts`

**QUAN TRỌNG:** `initTracing()` phải được gọi TRƯỚC `NestFactory.create()` — OTel cần patch Node.js modules trước khi chúng load.

```typescript
// main.ts
import { initTracing } from 'nestjs-boot';

// PHẢI gọi đầu tiên, trước NestFactory!
initTracing({
  enabled: true,
  serviceName: 'order-service',
  exporterType: 'jaeger',        // 'jaeger' | 'zipkin' | 'console' | 'otlp'
  endpoint: 'http://jaeger:4317',
  instrumentations: ['http', 'grpc', 'mongodb', 'redis'], // Auto-instrument
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

```typescript
// TracingModule (optional — cho manual spans)
import { TracingModule } from 'nestjs-boot';

@Module({
  imports: [
    TracingModule.register({
      serviceName: 'order-service',
    }),
  ],
})
export class AppModule {}
```

**Manual span creation với TracingService:**

File: `src/tracing/tracing.service.ts`

```typescript
// order.service.ts
import { TracingService } from 'nestjs-boot';

@Injectable()
export class OrderService {
  constructor(private readonly tracing: TracingService) {}

  async processOrder(dto: CreateOrderDto): Promise<Order> {
    // Tạo custom span để trace business logic
    return this.tracing.startSpan('order.process', async (span) => {
      span?.setAttribute('order.customer_id', dto.customerId);
      span?.setAttribute('order.item_count', dto.items.length);

      // Span con cho từng step
      const order = await this.tracing.startSpan('order.validate', async () => {
        return this.validateOrder(dto);
      });

      const savedOrder = await this.tracing.startSpan('order.save', async () => {
        return this.orderRepository.save(order);
      });

      span?.setAttribute('order.id', savedOrder.id);
      return savedOrder;
    });
  }
}
```

**@BootTrace decorator cho method-level tracing:**

File: `src/tracing/decorators.ts`

```typescript
import { BootTrace } from 'nestjs-boot';

@Injectable()
export class InventoryService {

  @BootTrace('inventory.reserve')  // Tự động tạo span cho method này
  async reserve(items: OrderItem[]): Promise<string> {
    // Toàn bộ method được wrap trong span
    // correlationId tự động được attach vào span
    return this.inventoryRepository.reserve(items);
  }
}
```

### 4.6 Context Propagation

CorrelationModule tích hợp với OTel để forward `traceparent` header giữa các services:

File: `src/correlation/correlation.middleware.ts`

```typescript
// Middleware tự động extract traceparent header
// và inject vào OTel context (nếu @opentelemetry/api được install)
if (traceparent) {
  const extractedContext = otelApi.propagation.extract(
    otelApi.context.active(),
    { traceparent }
  );
  otelApi.context.with(extractedContext, () => {
    correlationStorage.run({ correlationId, traceparent }, () => {
      next();
    });
  });
}
```

ServiceClient tự động inject `traceparent` vào gRPC metadata khi gọi service khác — đảm bảo trace liên tục qua service boundaries.

---

## 5. Setup Prometheus + Grafana

### 5.1 docker-compose.yml

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'

  prometheus:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=7d'

  grafana:
    image: grafana/grafana:latest
    ports:
      - '3001:3000'
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana-data:/var/lib/grafana

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - '16686:16686'   # Jaeger UI
      - '4317:4317'     # OTLP gRPC receiver
      - '4318:4318'     # OTLP HTTP receiver

volumes:
  grafana-data:
```

### 5.2 prometheus.yml

```yaml
global:
  scrape_interval: 15s      # Thu thập metrics mỗi 15 giây
  evaluation_interval: 15s  # Evaluate rules mỗi 15 giây

scrape_configs:
  - job_name: 'order-service'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'  # nestjs-boot expose tại đây

  # Thêm nhiều services
  - job_name: 'payment-service'
    static_configs:
      - targets: ['payment-service:3001']
```

### 5.3 Verify setup

```bash
# 1. Start tất cả services
docker-compose up -d

# 2. Kiểm tra metrics endpoint
curl http://localhost:3000/metrics | head -30

# Output mẫu:
# # HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# # TYPE process_cpu_user_seconds_total counter
# process_cpu_user_seconds_total 0.123456
#
# # HELP myapp_http_requests_total Total HTTP requests
# # TYPE myapp_http_requests_total counter
# myapp_http_requests_total{method="POST",route="/orders",status="201"} 42

# 3. Mở Grafana: http://localhost:3001 (admin/admin)
# 4. Mở Jaeger: http://localhost:16686
```

---

## 6. Tạo Grafana Dashboard

### 6.1 Thêm Prometheus Data Source

```
Grafana → Settings → Data Sources → Add Prometheus
URL: http://prometheus:9090
Save & Test → "Data source is working"
```

### 6.2 RED Dashboard queries

**Rate (requests/sec):**
```promql
rate(myapp_http_requests_total[5m])
```

**Error Rate (%):**
```promql
sum(rate(myapp_http_requests_total{status=~"5.."}[5m]))
/
sum(rate(myapp_http_requests_total[5m]))
* 100
```

**Duration P99 (ms):**
```promql
histogram_quantile(0.99,
  sum(rate(myapp_http_request_duration_seconds_bucket[5m])) by (le)
) * 1000
```

**Active Connections:**
```promql
myapp_active_connections
```

**Queue Depth:**
```promql
myapp_queue_waiting{name="email"}
```

### 6.3 Alerting Rules

```yaml
# prometheus-alerts.yml
groups:
  - name: service-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(myapp_http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(myapp_http_requests_total[5m]))
          > 0.05
        for: 2m           # Phải duy trì 2 phút → tránh false alarm
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: SlowRequests
        expr: |
          histogram_quantile(0.95,
            rate(myapp_http_request_duration_seconds_bucket[5m])
          ) > 1.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency > 1 second"
          description: "P95 latency: {{ $value }}s"

      - alert: HighQueueDepth
        expr: myapp_queue_waiting{name="email"} > 1000
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Email queue backlog > 1000"
```

---

## 7. Alert Best Practices

### 7.1 Alert Fatigue — Cảnh báo quá nhiều = không ai quan tâm

```
❌ SAI: Alert cho mọi thứ
  - CPU > 70% → Alert
  - 1 request 404 → Alert
  - Memory > 50% → Alert

✅ ĐÚNG: Chỉ alert khi USER BỊ ẢNH HƯỞNG
  - Error rate > 5% trong 2 phút → Alert (người dùng đang gặp lỗi)
  - P99 latency > 3s trong 5 phút → Alert (trải nghiệm xấu)
  - Service down > 30 giây → Alert (không thể truy cập)
```

### 7.2 Good Alert Properties (SMART)

```
S — Specific: Biết chính xác vấn đề gì
M — Measurable: Có số cụ thể (error rate = 7.3%)
A — Actionable: Khi nhận alert, biết phải làm gì ngay
R — Relevant: Ảnh hưởng thực sự đến user
T — Timely: Alert kịp thời, không quá chậm
```

### 7.3 Runbook — "Khi nhận alert này, làm gì?"

```markdown
## Alert: HighErrorRate

**Triệu chứng:** Error rate vượt 5%

**Bước 1: Xác định scope**
- Grafana → Check error rate per route
- Có route cụ thể nào bị ảnh hưởng không?

**Bước 2: Xem logs**
- kubectl logs -n prod order-service --since=5m | grep ERROR

**Bước 3: Xem traces**
- Jaeger → Search traces với tags: error=true, service=order-service

**Bước 4: Escalate**
- Nếu không fix trong 15 phút → notify lead engineer
```

---

## 8. Hands-on: Full Observability Setup

### Bước 1: Setup tất cả

```bash
# Install dependencies
npm install prom-client pino pino-pretty @opentelemetry/api @opentelemetry/sdk-node

# Với instrumentation tự động
npm install @opentelemetry/auto-instrumentations-node
```

### Bước 2: Cấu hình complete

```typescript
// main.ts
import { initTracing } from 'nestjs-boot';

// TRƯỚC TIÊN: init tracing
initTracing({
  enabled: process.env.TRACING_ENABLED === 'true',
  serviceName: process.env.SERVICE_NAME ?? 'my-service',
  exporterType: 'jaeger',
  endpoint: process.env.JAEGER_ENDPOINT ?? 'http://localhost:4317',
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new BootLogger({
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
      redact: ['password', 'token', 'secret'],
    }),
  });

  // Global interceptors
  const metricsInterceptor = app.get(HttpMetricsInterceptor);
  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(metricsInterceptor, loggingInterceptor);

  await app.listen(3000);
  console.log('App running on :3000, metrics at :3000/metrics');
}
bootstrap();
```

```typescript
// app.module.ts
@Module({
  imports: [
    CorrelationModule.register(),
    MetricsModule.register({
      enabled: true,
      defaultMetrics: true,
      prefix: 'myapp_',
      path: '/metrics',
    }),
    LoggingModule.register({
      level: 'info',
    }),
    TracingModule.register({
      serviceName: 'my-service',
    }),
  ],
})
export class AppModule {}
```

### Bước 3: Generate traffic và observe

```bash
# Tạo traffic
for i in {1..100}; do
  curl -s -X POST http://localhost:3000/orders \
    -H "Content-Type: application/json" \
    -d '{"customerId": "user-1", "items": [{"sku": "SKU-001", "qty": 1}]}' &
done
wait

# Xem metrics
curl http://localhost:3000/metrics | grep myapp_http

# Xem trong Grafana: http://localhost:3001
# Xem traces trong Jaeger: http://localhost:16686
```

---

## 9. MILESTONE 3 — Requirements

### 9.1 Checklist hoàn thành Stage 3

Để pass Milestone 3, sinh viên phải demonstrate:

**Microservices (Tuần 9):**
- [ ] Chạy được hệ thống 10-service từ `examples/microservices/`
- [ ] Trace request qua ít nhất 3 services bằng Correlation ID
- [ ] Giải thích được vì sao API Gateway cần thiết

**Queue (Tuần 10):**
- [ ] Setup BullMQ với Redis
- [ ] Implement email job với retry strategy
- [ ] Xử lý failed jobs (DLQ)
- [ ] Demo Bull Board UI

**Events & CQRS (Tuần 11):**
- [ ] Implement EventBus với ít nhất 3 event handlers
- [ ] Implement CQRS với Command/Query separation
- [ ] Demo Saga với compensating actions

**Observability (Tuần 12):**
- [ ] Metrics: RED dashboard trong Grafana
- [ ] Logging: structured JSON logs với correlationId
- [ ] Tracing: trace request qua 2+ services trong Jaeger
- [ ] Alert: ít nhất 1 alert rule cho error rate

### 9.2 Capstone Project — Đề xuất

Implement một **E-commerce mini system** với:

```
Requirements:
1. Product Service (CRUD products)
2. Order Service (CQRS + Event Sourcing)
3. Notification Service (Email/SMS qua BullMQ)
4. API Gateway (JWT auth + Correlation ID)
5. Full Observability:
   - Prometheus metrics (RED method)
   - Structured logging (Pino)
   - Distributed tracing (OTel → Jaeger)
   - Grafana dashboard

Bonus:
- Implement Order Saga (inventory + payment)
- Outbox pattern cho reliable event publishing
- Alert cho error rate > 5%
```

---

## 10. Bài tập thực hành

### Exercise 1: RED Dashboard

1. Tạo Grafana dashboard với 4 panels:
   - **Request Rate**: requests/sec per service
   - **Error Rate**: error % với threshold line tại 5%
   - **P50/P95/P99 Latency**: histogram percentiles
   - **Active Queue Jobs**: waiting + active + failed

### Exercise 2: Structured Logging Query

Với Loki (hoặc dùng `cat logs.json | jq`):
```bash
# Tìm tất cả errors của user cụ thể
cat app.log | jq 'select(.level == "error" and .userId == "user-456")'

# Group errors by type
cat app.log | jq -s 'group_by(.error) | map({error: .[0].error, count: length})'

# Tìm requests chậm nhất
cat app.log | jq -s 'map(select(.duration > 1000)) | sort_by(.duration) | reverse | .[0:10]'
```

### Exercise 3: Trace qua 2 services

1. Enable tracing trong cả API Gateway và Order Service
2. Gửi 1 request qua API Gateway → Order Service
3. Mở Jaeger UI, tìm trace của request đó
4. Xác nhận trace ID giống nhau ở cả 2 services
5. Identify span nào tốn nhiều thời gian nhất

### Homework

1. Kubernetes tích hợp Observability như thế nào? Tìm hiểu về Prometheus Operator.
2. ELK Stack (Elasticsearch + Logstash + Kibana) so với Grafana + Loki — khi nào dùng cái nào?
3. OpenTelemetry Collector là gì? Tại sao nên dùng thay vì export trực tiếp?

---

## 11. Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `prom-client not installed` | Thiếu package | `npm install prom-client` |
| Metrics endpoint trả về 404 | MetricsModule chưa register | Thêm `MetricsModule.register()` vào imports |
| Spans không xuất hiện trong Jaeger | `initTracing()` gọi sau NestFactory | Đảm bảo `initTracing()` là dòng đầu tiên trong main.ts |
| correlationId không có trong logs | BootLogger không được set làm app logger | `NestFactory.create(AppModule, { logger: new BootLogger() })` |
| Grafana không thấy Prometheus data | URL sai trong datasource config | Dùng service name trong docker network: `http://prometheus:9090` |
| Quá nhiều alerts | Alert threshold quá nhạy | Thêm `for: 2m` để chỉ alert khi kéo dài |
| Log quá nhiều, gây chậm | Log level quá thấp (DEBUG) | Set `LOG_LEVEL=info` trong production |

---

## 12. Self-check Questions

1. Phân biệt **Counter**, **Gauge**, **Histogram** — cho ví dụ thực tế cho từng loại.
2. **RED method** gồm những gì? Tại sao đây là minimum viable monitoring?
3. Tại sao `initTracing()` phải được gọi trước `NestFactory.create()`?
4. **Structured logging** giúp gì so với plain text? Cho ví dụ query chỉ làm được với structured logs.
5. Giải thích **distributed tracing context propagation**: trace ID được truyền như thế nào từ API Gateway xuống Order Service xuống DB query?

---

## 13. Đọc thêm

- [Google SRE Book — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/instrumentation/js/)
- [Pino Documentation](https://getpino.io/) — Node.js fastest logger
- [nestjs-boot source] `src/metrics/` — MetricsModule, MetricsService, HttpMetricsInterceptor
- [nestjs-boot source] `src/logging/` — BootLogger, LoggingInterceptor
- [nestjs-boot source] `src/tracing/` — TracingModule, TracingService, initTracing, @BootTrace
- [nestjs-boot source] `src/correlation/` — CorrelationModule, AsyncLocalStorage integration
- [Grafana Dashboards Gallery](https://grafana.com/grafana/dashboards/) — import pre-built dashboards

---

*Tuần trước: [Tuần 11 — Event-Driven Architecture & CQRS](./week-11-events-cqrs.md)*
*Stage 4: [Production Engineering — CI/CD, Kubernetes, Security](../stage-4-production/)*
