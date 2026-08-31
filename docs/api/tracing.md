# Tracing API Reference

> OpenTelemetry distributed tracing integration with graceful no-op when `@opentelemetry/*` packages are absent.

## Module Registration

```ts
TracingModule.register(options?: TracingOptions): DynamicModule
```

Registers `TracingService` globally. All `@opentelemetry/*` packages are optional — the module and service degrade gracefully when not installed.

```ts
// In createApp() via BootOptions.tracing
TracingModule.register({
  exporter: 'otlp',
  endpoint: 'http://otel-collector:4318/v1/traces',
  serviceName: 'order-service',
  sampleRate: 0.1,  // 10% in production
})
```

## Functions

### `initTracing`

```ts
function initTracing(options: TracingOptions): void
```

Initialize the OpenTelemetry Node SDK.

**Must be called BEFORE `NestFactory.create()`** — the OTel SDK patches HTTP/gRPC/Mongo/Redis modules at import time, so it must be running before those modules load. When using `createApp()`, this is handled automatically.

Behavior:
- Skips with a warning if `options.enabled === false`.
- Warns if called after `NestFactory.create()` (spans may be missing).
- Gracefully no-ops if `@opentelemetry/sdk-node` is not installed.
- Registers `SIGTERM` / `SIGINT` handlers for graceful SDK shutdown.
- Loads `@opentelemetry/auto-instrumentations-node` if installed.

Supported exporters:

| `exporter` | Package required |
|---|---|
| `'otlp'` | `@opentelemetry/exporter-trace-otlp-http` |
| `'jaeger'` | `@opentelemetry/exporter-jaeger` |
| `'zipkin'` | `@opentelemetry/exporter-zipkin` |
| `'console'` | `@opentelemetry/sdk-trace-base` |

## Classes / Methods

### `TracingService`

Injectable service for manual span creation. All methods gracefully no-op if `@opentelemetry/api` is not installed.

```ts
@Injectable()
class TracingService {
  /**
   * Create a span, run the function within it, and end the span.
   * Automatically attaches correlationId as the 'correlation.id' attribute.
   * Records exception and sets ERROR status on throw.
   */
  async startSpan<T>(
    name: string,
    fn: (span?: any) => T | Promise<T>,
  ): Promise<T>

  /**
   * Get the currently active span, or undefined.
   */
  getActiveSpan(): any | undefined

  /**
   * Add an attribute to the currently active span.
   */
  addAttribute(key: string, value: string | number | boolean): void

  /**
   * Record an exception on the currently active span and set ERROR status.
   */
  recordException(error: Error): void
}
```

```ts
@Injectable()
export class ProductService {
  constructor(private readonly tracing: TracingService) {}

  async findById(id: string) {
    return this.tracing.startSpan('ProductService.findById', async (span) => {
      span?.setAttribute('product.id', id);
      return this.repo.findById(id);
    });
  }
}
```

## Decorators

### `@BootTrace(spanName?)`

```ts
function BootTrace(spanName?: string): MethodDecorator
```

Method decorator that auto-creates an OpenTelemetry span around the decorated method. Supports both sync and async methods.

Behavior:
- If `spanName` is omitted, auto-generates `ClassName.methodName`.
- Attaches `correlationId` as `correlation.id` attribute when available.
- Records exceptions and sets `ERROR` status on throw.
- Is a transparent no-op if `@opentelemetry/api` is not installed.

```ts
@Injectable()
export class ProductService {
  @BootTrace('ProductService.findById')
  async findById(id: string) {
    return this.repo.findById(id);
  }

  @BootTrace()  // auto-generates 'ProductService.findAll'
  async findAll() { ... }
}
```

## Interfaces

### `TracingOptions`

```ts
interface TracingOptions {
  /** Enable tracing. Default: true when tracing config is provided. */
  enabled?: boolean;

  /** Exporter type */
  exporter: 'otlp' | 'jaeger' | 'zipkin' | 'console';

  /** Exporter endpoint URL. Required for otlp/jaeger/zipkin. */
  endpoint?: string;

  /** Service name for traces. Default: package.json name. */
  serviceName?: string;

  /** Sample rate 0.0–1.0. Default: 1.0 in dev, 0.1 in prod. */
  sampleRate?: number;
}
```

## Constants / Tokens

| Token | Value | Description |
|---|---|---|
| `TRACING_OPTIONS` | `Symbol('TRACING_OPTIONS')` | DI token for the resolved `TracingOptions` |
