# Logging API Reference

> Structured JSON logging via pino with automatic correlation ID and OpenTelemetry trace ID injection. Falls back to `console` if pino is not installed.

## Module Registration

```ts
import { LoggingModule } from 'nestjs-boot';

// Minimal
LoggingModule.register()

// Full options
LoggingModule.register({
  level: 'debug',
  pretty: true,
  redact: ['req.headers.authorization', 'body.password'],
  context: { region: 'us-east-1', team: 'platform' },
})
```

Via `BootOptions`:

```ts
createApp(AppModule, {
  logging: {
    level: 'info',
    redact: ['req.headers.authorization'],
    context: { region: 'eu-west-1' },
  },
});
```

`LoggingModule` is registered as **global**. `BootLogger`, `LoggingInterceptor`, and `LOGGING_OPTIONS` are exported and injectable anywhere.

## Classes / Methods

### `BootLogger`

NestJS `LoggerService` backed by pino. Falls back to `console` when pino is not installed.

Auto-injects `correlationId` from `AsyncLocalStorage` (via `CorrelationModule`) and `traceId` from the active OpenTelemetry span on every log line.

```ts
class BootLogger implements LoggerService {
  constructor(options?: LoggingOptions)
}
```

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `log` | `(message: any, context?: string): void` | Info-level log |
| `error` | `(message: any, trace?: string, context?: string): void` | Error-level log; includes stack trace |
| `warn` | `(message: any, context?: string): void` | Warn-level log |
| `debug` | `(message: any, context?: string): void` | Debug-level log |
| `verbose` | `(message: any, context?: string): void` | Trace-level log (maps to pino `trace`) |
| `fatal` | `(message: any, context?: string): void` | Fatal-level log |
| `getPinoInstance` | `(): any` | Returns the underlying pino instance, or `undefined` if not available |

**Automatic fields on every log line:**

| Field | Source |
|-------|--------|
| `service` | `OTEL_SERVICE_NAME` env → `SERVICE_NAME` env → `package.json` `name` |
| `environment` | `NODE_ENV` env (default: `'development'`) |
| `version` | `APP_VERSION` env → `package.json` `version` |
| `correlationId` | `CorrelationModule` `AsyncLocalStorage` |
| `traceId` | Active OpenTelemetry span (if `@opentelemetry/api` installed) |
| `context` | Caller-provided context string |
| `...extras` | Fields passed via `LoggingOptions.context` |

---

### `LoggingInterceptor`

NestJS interceptor that logs HTTP request start and completion (method, URL, status code, duration, correlation ID).

```ts
@Injectable()
class LoggingInterceptor implements NestInterceptor
```

Logs two lines per request:

```
→ GET /users/1 [abc-123] ua="Mozilla/5.0..."
← GET /users/1 200 45ms [abc-123]
```

Inject `BootLogger` via `BOOT_LOGGER` token if available; falls back to NestJS default `Logger`.

**Usage:**

```ts
// Apply globally
app.useGlobalInterceptors(app.get(LoggingInterceptor));

// Or per-controller
@UseInterceptors(LoggingInterceptor)
@Controller('users')
export class UsersController {}
```

---

### `buildLogContext(extra?)`

Builds the base static log context from environment + `package.json`. Result is cached for the process lifetime.

```ts
function buildLogContext(extra?: Record<string, unknown>): LogContext
```

### `resetLogContextCache()`

Resets the cached context. Primarily for testing.

```ts
function resetLogContextCache(): void
```

## Interfaces

### `LoggingOptions`

```ts
interface LoggingOptions {
  /** Log level (default: 'info') */
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Pretty-print logs (default: NODE_ENV !== 'production') */
  pretty?: boolean;
  /** Paths to redact from log output (e.g. ['req.headers.authorization']) */
  redact?: string[];
  /**
   * Static context fields added to every log line.
   * Auto-populated: service, environment, version.
   * Use to add extra fields like region, team, datacenter.
   */
  context?: Record<string, unknown>;
}
```

### `LogContext`

```ts
interface LogContext {
  /** Auto-detected from package.json name or OTEL_SERVICE_NAME env */
  service?: string;
  /** NODE_ENV value */
  environment?: string;
  /** Package version from package.json */
  version?: string;
  /** Any additional user-provided fields */
  [key: string]: unknown;
}
```

## Constants / Tokens

| Export | Value | Description |
|--------|-------|-------------|
| `LOGGING_OPTIONS` | `'LOGGING_OPTIONS'` | Injection token for `LoggingOptions` |

## Peer Dependencies

| Package | Required | Purpose |
|---------|----------|---------|
| `pino` | Optional | Structured JSON logging. Falls back to `console` if absent. |
| `pino-pretty` | Optional | Human-readable dev output. Auto-detected; skipped in production. |
| `@opentelemetry/api` | Optional | Injects `traceId` from active span. Skipped if absent. |
