# Metrics API Reference

> Prometheus metrics collection via prom-client — HTTP request duration/count, DB query instrumentation, cache hit/miss tracking, and queue job telemetry. No-ops gracefully when prom-client is not installed.

## Module Registration

```ts
import { MetricsModule } from 'nestjs-boot';

// Minimal — exposes GET /metrics
MetricsModule.register()

// Full options
MetricsModule.register({
  enabled: true,
  path: '/metrics',
  prefix: 'myapp_',
  defaultMetrics: true,
})
```

Via `BootOptions`:

```ts
createApp(AppModule, {
  metrics: {
    enabled: true,
    prefix: 'myapp_',
  },
});
```

`MetricsModule` is registered as **global**. `MetricsService` and `HttpMetricsInterceptor` are exported.

When `enabled: true` (default), a `GET /<path>` endpoint is registered via `RouterModule` (default path: `/metrics`). When `enabled: false`, no controller is registered but `MetricsService` is still injectable.

## Classes / Methods

### `MetricsService`

Core service for creating and managing Prometheus metric instances. All methods are idempotent — calling the same `name` twice returns the same registered metric.

```ts
@Injectable()
class MetricsService implements OnModuleInit
```

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `counter` | `(name: string, help: string, labelNames?: string[]): any` | Create or retrieve a prom-client `Counter` |
| `histogram` | `(name: string, help: string, buckets?: number[], labelNames?: string[]): any` | Create or retrieve a prom-client `Histogram` |
| `gauge` | `(name: string, help: string, labelNames?: string[]): any` | Create or retrieve a prom-client `Gauge` |
| `setHealthStatus` | `(indicator: string, healthy: boolean): void` | Set `boot_health_status{indicator}` gauge — called by health check integration |
| `getRegistry` | `(): Registry \| undefined` | Returns the underlying prom-client `Registry`, or `undefined` if prom-client is not installed |

The `prefix` from `MetricsOptions` is automatically prepended to all metric names. When prom-client is absent, all methods return a no-op stub with the same interface (`inc`, `dec`, `set`, `observe`, `labels`, `startTimer`, `reset`, `remove`).

**Built-in metric registered on init:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `boot_health_status` | Gauge | `indicator` | `1` = healthy, `0` = unhealthy |

---

### `HttpMetricsInterceptor`

NestJS interceptor that records HTTP request duration and count. Wire globally or per-controller.

```ts
@Injectable()
class HttpMetricsInterceptor implements NestInterceptor
```

**Metrics emitted:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency (buckets: 5ms–10s) |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total request count |

**Usage:**

```ts
// Apply globally
app.useGlobalInterceptors(app.get(HttpMetricsInterceptor));
```

---

### `CacheMetricsInterceptor`

Injectable service for recording cache hit/miss counts and operation durations. Use manually around cache tier calls or via the `wrap*` helpers.

```ts
@Injectable()
class CacheMetricsInterceptor
```

**Metrics emitted:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `boot_cache_hit_total` | Counter | `layer` | Cache hits per tier (`l1` \| `l2`) |
| `boot_cache_miss_total` | Counter | `layer` | Cache misses per tier |
| `boot_cache_operation_duration_seconds` | Histogram | `operation`, `layer` | Duration per operation (get/set/del) |

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `recordHit` | `(layer?: string): void` | Record a cache hit. `layer` defaults to `'l1'` |
| `recordMiss` | `(layer?: string): void` | Record a cache miss |
| `wrapGet` | `<T>(layer: string, fn: () => Promise<T \| null \| undefined>): Promise<T \| null \| undefined>` | Wrap a GET: records duration + hit (non-null) or miss (null/undefined) |
| `wrapSet` | `<T>(layer: string, fn: () => Promise<T>): Promise<T>` | Wrap a SET: records duration |
| `wrapDel` | `<T>(layer: string, fn: () => Promise<T>): Promise<T>` | Wrap a DELETE: records duration |

```ts
// Manual
cacheMetrics.recordHit('l1');
cacheMetrics.recordMiss('l2');

// Auto-instrument
const value = await cacheMetrics.wrapGet('l1', () => redis.get(key));
```

---

### `DbMetricsInterceptor`

NestJS interceptor for database query instrumentation. Supports both the interceptor pattern (route-level) and a static Mongoose plugin for automatic per-query instrumentation.

```ts
@Injectable()
class DbMetricsInterceptor implements NestInterceptor
```

**Metrics emitted:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `boot_db_query_duration_seconds` | Histogram | `connection`, `operation` | Query latency (buckets: 1ms–2.5s) |
| `boot_db_query_total` | Counter | `connection`, `operation`, `status` | Total query count (`success` \| `error`) |

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `intercept` | NestJS interceptor | Records as `connection='default'`, `operation='query'` |
| `recordOperation` | `<T>(connection: string, operation: string, fn: () => Promise<T>): Promise<T>` | Manually wrap a DB call with connection + operation labels |
| `DbMetricsInterceptor.mongoosePlugin` | `static (metricsService: MetricsService): (schema: any) => void` | Returns a Mongoose plugin that auto-instruments all query and document middleware |

**Mongoose plugin usage:**

```ts
import mongoose from 'mongoose';
const plugin = DbMetricsInterceptor.mongoosePlugin(metricsService);

// Global
mongoose.plugin(plugin);

// Per-schema
UserSchema.plugin(plugin);
```

Instrumented Mongoose operations:
- **Query:** `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `count`, `countDocuments`, `distinct`
- **Document:** `save`, `remove`, `deleteOne`, `validate`
- **Aggregate:** `aggregate`

---

### `QueueMetrics`

Injectable service for recording Bull/BullMQ job telemetry.

```ts
@Injectable()
class QueueMetrics
```

**Metrics emitted:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `boot_queue_jobs_total` | Counter | `queue`, `status` | Job count (`completed` \| `failed` \| `stalled`) |
| `boot_queue_job_duration_seconds` | Histogram | `queue` | Job processing duration (buckets: 10ms–30s) |
| `boot_queue_depth` | Gauge | `queue` | Number of pending jobs |

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `recordCompleted` | `(queue: string, durationMs?: number): void` | Record a completed job, optionally with duration |
| `recordFailed` | `(queue: string): void` | Record a failed job |
| `recordStalled` | `(queue: string): void` | Record a stalled job |
| `setDepth` | `(queue: string, depth: number): void` | Update queue depth gauge |
| `wrapJob` | `<T>(queue: string, fn: () => Promise<T>): Promise<T>` | Wrap a job processor: auto-records duration and completed/failed status |

```ts
// Wire into Bull events
const queueMetrics = app.get(QueueMetrics);

myQueue.on('completed', (job) => {
  queueMetrics.recordCompleted('email', job.processedOn! - job.timestamp);
});
myQueue.on('failed', () => queueMetrics.recordFailed('email'));

// Or use the wrapper
const result = await queueMetrics.wrapJob('email', () => processEmail(data));
```

---

### `MetricsController`

Internal controller registered at the configured metrics path. Returns Prometheus text format.

```
GET /<path>   → 200 text/plain (Prometheus exposition format)
              → 503 if prom-client not installed
```

## Interfaces

### `MetricsOptions`

```ts
interface MetricsOptions {
  /** Enable metrics endpoint (default: true) */
  enabled?: boolean;
  /** Path for the metrics endpoint (default: '/metrics') */
  path?: string;
  /** Prefix for all metric names (e.g. 'myapp_') */
  prefix?: string;
  /** Collect default Node.js process metrics (default: true) */
  defaultMetrics?: boolean;
}
```

## Constants / Tokens

| Export | Value | Description |
|--------|-------|-------------|
| `METRICS_OPTIONS` | `'METRICS_OPTIONS'` | Injection token for `MetricsOptions` |
| `METRICS_SERVICE` | `'METRICS_SERVICE'` | Injection token for `MetricsService` |
| `DEFAULT_METRICS_PATH` | `'/metrics'` | Default path for the metrics endpoint |

## Peer Dependencies

| Package | Required | Purpose |
|---------|----------|---------|
| `prom-client` | Optional | Prometheus metric registry and collectors. All APIs no-op when absent. |
