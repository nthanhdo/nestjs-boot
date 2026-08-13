# Observability

nestjs-boot provides four integrated observability pillars: distributed tracing (OpenTelemetry), Prometheus metrics, structured logging (pino), and request correlation IDs. All four are opt-in with graceful no-op fallbacks when peer dependencies are absent.

## Correlation IDs

The foundation layer. Assigns a unique ID to every request and propagates it through logs, traces, and downstream services via AsyncLocalStorage.

### Setup

```ts
import { CorrelationModule } from 'nestjs-boot/correlation';

@Module({
  imports: [
    CorrelationModule.register({
      header: 'X-Correlation-Id',  // default
      generator: () => crypto.randomUUID(), // default
    }),
  ],
})
export class AppModule {}
```

The middleware reads `X-Correlation-Id` from incoming requests (or generates one), stores it in AsyncLocalStorage, and sets it on the response header.

### Reading the Correlation ID

```ts
import { getCorrelationId } from 'nestjs-boot/correlation';

// Anywhere in your code during a request:
const id = getCorrelationId(); // string | undefined
```

For programmatic contexts (background jobs, tests):

```ts
import { runWithCorrelationId } from 'nestjs-boot/correlation';

runWithCorrelationId('job-abc-123', () => {
  // getCorrelationId() returns 'job-abc-123' here
  processJob();
});
```

### W3C Traceparent

The middleware automatically extracts the `traceparent` header and feeds it into OpenTelemetry context propagation when `@opentelemetry/api` is installed. Access it with:

```ts
import { getTraceparent } from 'nestjs-boot/correlation';
```

### Response Header Interceptor

`CorrelationInterceptor` attaches the correlation ID to HTTP responses and provides a helper for outgoing RPC calls:

```ts
import { CorrelationInterceptor, withCorrelationId } from 'nestjs-boot/correlation';

// Global registration
app.useGlobalInterceptors(new CorrelationInterceptor());

// In a service calling another microservice:
const metadata = withCorrelationId({});
this.client.send('pattern', { data, metadata });
```

## Distributed Tracing (OpenTelemetry)

### Install Dependencies

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-trace-base
# Pick one exporter:
npm install @opentelemetry/exporter-trace-otlp-http   # OTLP (Grafana Tempo, etc.)
npm install @opentelemetry/exporter-jaeger             # Jaeger
npm install @opentelemetry/exporter-zipkin             # Zipkin
# Optional auto-instrumentation:
npm install @opentelemetry/auto-instrumentations-node
```

### Initialization

`initTracing()` must be called **before** `NestFactory.create()` so the OTel SDK can patch HTTP/gRPC/DB modules at import time:

```ts
import { initTracing } from 'nestjs-boot/tracing';

initTracing({
  exporter: 'otlp',
  endpoint: 'http://localhost:4318/v1/traces',
  serviceName: 'order-service',
  sampleRate: 0.1, // 10% in production
});

const app = await NestFactory.create(AppModule);
```

If you use `createApp()`, tracing initialization is handled automatically.

Register TracingModule to make TracingService injectable:

```ts
import { TracingModule } from 'nestjs-boot/tracing';

@Module({
  imports: [TracingModule.register()],
})
export class AppModule {}
```

### @BootTrace Decorator

Automatically wraps a method in an OpenTelemetry span:

```ts
import { BootTrace } from 'nestjs-boot/tracing';

@Injectable()
export class ProductService {
  @BootTrace('ProductService.findById')
  async findById(id: string) {
    return this.repo.findById(id);
  }

  @BootTrace() // auto-generates name: "ProductService.findAll"
  async findAll() { ... }
}
```

The decorator automatically attaches the correlation ID as a span attribute, records exceptions, and sets error status on failure. If `@opentelemetry/api` is not installed, the decorator is a no-op.

### TracingService (Manual Spans)

For fine-grained control:

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

    // Other helpers:
    this.tracing.addAttribute('key', 'value'); // add to active span
    this.tracing.recordException(new Error('fail')); // record on active span
    const span = this.tracing.getActiveSpan(); // get current span
  }
}
```

### Exporter Options

| Exporter | Package | Endpoint Example |
|----------|---------|------------------|
| `'otlp'` | `@opentelemetry/exporter-trace-otlp-http` | `http://localhost:4318/v1/traces` |
| `'jaeger'` | `@opentelemetry/exporter-jaeger` | `http://localhost:14268/api/traces` |
| `'zipkin'` | `@opentelemetry/exporter-zipkin` | `http://localhost:9411/api/v2/spans` |
| `'console'` | `@opentelemetry/sdk-trace-base` | (none, prints to stdout) |

## Prometheus Metrics

### Install Dependencies

```bash
npm install prom-client
```

### Setup

```ts
import { MetricsModule } from 'nestjs-boot/metrics';

@Module({
  imports: [
    MetricsModule.register({
      enabled: true,
      path: '/metrics',     // Prometheus scrape endpoint
      prefix: 'myapp_',     // prefix all metric names
      defaultMetrics: true,  // collect Node.js process metrics
    }),
  ],
})
export class AppModule {}
```

This exposes a `GET /metrics` endpoint returning Prometheus text format.

### Creating Custom Metrics

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

### Built-in Interceptors

**HttpMetricsInterceptor** records `http_request_duration_seconds` and `http_requests_total` with method, route, and status_code labels:

```ts
import { HttpMetricsInterceptor } from 'nestjs-boot/metrics';

app.useGlobalInterceptors(app.get(HttpMetricsInterceptor));
```

**DbMetricsInterceptor** records `boot_db_query_duration_seconds` and `boot_db_query_total`. Use as an interceptor or wrap operations manually:

```ts
import { DbMetricsInterceptor } from 'nestjs-boot/metrics';

// As interceptor on a controller
@UseInterceptors(DbMetricsInterceptor)

// Or as a Mongoose plugin for automatic instrumentation
import mongoose from 'mongoose';
const plugin = DbMetricsInterceptor.mongoosePlugin(metricsService);
mongoose.plugin(plugin);
```

**CacheMetricsInterceptor** records `boot_cache_hit_total`, `boot_cache_miss_total`, and `boot_cache_operation_duration_seconds`:

```ts
import { CacheMetricsInterceptor } from 'nestjs-boot/metrics';

const cacheMetrics = new CacheMetricsInterceptor(metricsService);
const value = await cacheMetrics.wrapGet('l1', () => redis.get(key));
await cacheMetrics.wrapSet('l2', () => redis.set(key, value));
```

**QueueMetrics** records `boot_queue_jobs_total`, `boot_queue_job_duration_seconds`, and `boot_queue_depth`:

```ts
import { QueueMetrics } from 'nestjs-boot/metrics';

const queueMetrics = app.get(QueueMetrics);
const result = await queueMetrics.wrapJob('email', () => processJob(data));
queueMetrics.setDepth('email', await myQueue.count());
```

## Structured Logging (Pino)

### Install Dependencies

```bash
npm install pino
npm install pino-pretty  # optional, for dev pretty-printing
```

### Setup

```ts
import { LoggingModule } from 'nestjs-boot/logging';
import { BootLogger } from 'nestjs-boot/logging';

@Module({
  imports: [
    LoggingModule.register({
      level: 'info',
      pretty: true,            // auto-disabled in production
      redact: ['req.headers.authorization', 'password'],
      context: { region: 'us-east-1', team: 'platform' },
    }),
  ],
})
export class AppModule {}

// Use as NestJS logger:
const app = await NestFactory.create(AppModule, {
  logger: app.get(BootLogger),
});
```

### Automatic Context

Every log line automatically includes:

| Field | Source |
|-------|--------|
| `service` | `OTEL_SERVICE_NAME` env, or `package.json` name |
| `environment` | `NODE_ENV` |
| `version` | `APP_VERSION` env, or `package.json` version |
| `correlationId` | AsyncLocalStorage (from CorrelationModule) |
| `traceId` | OpenTelemetry active span (if available) |

Custom static fields from `context` option are merged into every log line.

### LoggingInterceptor

Logs HTTP request/response with timing and correlation ID:

```ts
import { LoggingInterceptor } from 'nestjs-boot/logging';

app.useGlobalInterceptors(app.get(LoggingInterceptor));
// Output: → GET /api/products [abc-123] ua="Mozilla/5.0..."
//         ← GET /api/products 200 45ms [abc-123]
```

## Best Practices

- Register modules in this order: `CorrelationModule` first, then `TracingModule`, then `LoggingModule`, then `MetricsModule`. Correlation IDs flow into traces and logs automatically.
- Call `initTracing()` before `NestFactory.create()`. The framework warns if this order is violated.
- All four modules gracefully degrade when peer dependencies are missing. `MetricsService` returns no-op metric stubs, `TracingService` methods are no-ops, `BootLogger` falls back to `console`, and correlation storage works regardless.
- Use `prom-client` prefix option to namespace metrics per service and avoid collisions in a shared Prometheus instance.
- Set `sampleRate` to `0.1` or lower in production to control trace volume and cost.
- Use `redact` in LoggingModule to prevent sensitive data (tokens, passwords) from appearing in logs.
