# Shutdown API Reference

> Kubernetes-aware graceful shutdown with configurable signal handling, in-flight request draining, and ordered teardown lifecycle.

## Module Registration

```ts
import { ShutdownModule } from 'nestjs-boot';

// main.ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks(); // required for onApplicationShutdown to fire

// AppModule
@Module({
  imports: [
    ShutdownModule.register({
      timeout: 25_000,
      signals: ['SIGTERM', 'SIGINT'],
      drainStrategy: 'drain',
      beforeShutdown: async () => {
        await flushPendingEvents();
      },
    }),
  ],
})
export class AppModule {}
```

`ShutdownModule` is **global** — `ShutdownService` and `InFlightTracker` are available in every module.

---

## Classes

### `ShutdownModule`

`@Global()` · `@Module`

#### Static Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(options?: ShutdownOptions): DynamicModule` | Register the shutdown system. `options` defaults to `{}` (30s timeout, `['SIGTERM', 'SIGINT']`, drain strategy). |

---

### `ShutdownService`

`@Injectable()` · `implements OnApplicationShutdown`

Orchestrates graceful shutdown in two ordered phases:

1. **Phase 1** — runs `beforeShutdown` hook if configured.
2. **Phase 2** — stops the HTTP server (waits for in-flight drain if `drainStrategy: 'drain'`), then calls `server.closeAllConnections()` (Node 18.2+).

Signal registration and in-flight tracking are delegated to `SignalHandler` and `InFlightTracker`.

#### Constructor

```ts
constructor(
  @Inject(SHUTDOWN_OPTIONS) options: ShutdownOptions,
  @Inject(HttpAdapterHost) httpAdapterHost: HttpAdapterHost,
  @Inject(InFlightTracker) inFlightTracker: InFlightTracker,
)
```

Registers OS signal handlers immediately on construction. Logs K8s environment info if `KUBERNETES_SERVICE_HOST` is set.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `inFlightTracker` | `InFlightTracker` | Public reference to the tracker — use for health checks. |

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `isShuttingDownNow` | `(): boolean` | Returns `true` once shutdown has been initiated. Health endpoints should return 503 when this is true. |
| `getSignals` | `(): string[]` | Returns a copy of the registered OS signal list. |
| `onApplicationShutdown` | `(signal?: string): Promise<void>` | Called by NestJS after `enableShutdownHooks()`. Runs the two-phase teardown sequence. |
| `getInFlightCount` | `(): number` | **Deprecated** — use `inFlightTracker.getCount()` directly. |
| `incrementInFlight` | `(): void` | **Deprecated** — use `inFlightTracker.increment()` directly. |
| `decrementInFlight` | `(): void` | **Deprecated** — use `inFlightTracker.decrement()` directly. |

---

### `InFlightTracker`

`@Injectable()`

Tracks the number of currently active HTTP requests. Extracted from `ShutdownService` (SRP) so it can be used independently by interceptors and health checks.

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `increment` | `(): void` | Increment the in-flight counter. Call on request start. |
| `decrement` | `(): void` | Decrement the in-flight counter (floor: 0). Call on request complete or error. |
| `getCount` | `(): number` | Returns the current number of in-flight requests. |

**Typical usage with a custom interceptor:**

```ts
@Injectable()
export class InFlightRequestInterceptor implements NestInterceptor {
  constructor(private readonly tracker: InFlightTracker) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    this.tracker.increment();
    return next.handle().pipe(
      finalize(() => this.tracker.decrement()),
    );
  }
}
```

---

### `SignalHandler`

Internal class used by `ShutdownService` to register OS signal handlers. Extracted for SRP — not exported as a DI provider.

#### Constructor

```ts
constructor(
  signals: string[],
  timeout: number,
  onSignal: () => void,
)
```

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(): void` | Attaches `process.on(signal, ...)` handlers. Sets a force-exit timeout safety net that calls `process.exit(1)` if shutdown takes longer than `timeout` ms. Duplicate signals are ignored. |

---

## Functions

### `isKubernetesEnvironment(): boolean`

Returns `true` when `KUBERNETES_SERVICE_HOST` is set in the process environment (K8s always sets this).

### `getK8sPreStopDelay(): number`

Returns the configured preStop delay in milliseconds. Reads `BOOT_PRESTOP_DELAY_MS` env var, defaults to `5000`.

### `getK8sShutdownInfo(): { isK8s: boolean; preStopDelay: number; message: string }`

Returns a summary object for startup logging. `message` includes a human-readable K8s deployment recommendation.

---

## Interfaces

### `ShutdownOptions`

```ts
interface ShutdownOptions {
  /** Maximum wait time in ms before force-exit (default: 30000) */
  timeout?: number;
  /** OS signals to handle (default: ['SIGTERM', 'SIGINT']) */
  signals?: string[];
  /** Custom async hook called before NestJS shutdown sequence */
  beforeShutdown?: () => Promise<void>;
  /**
   * In-flight drain strategy (default: 'drain')
   * - 'drain' — wait for all in-flight requests to complete (zero-downtime)
   * - 'immediate' — close server immediately, drops in-flight requests
   */
  drainStrategy?: DrainStrategy;
}
```

### `DrainStrategy`

```ts
type DrainStrategy = 'drain' | 'immediate';
```

---

## Constants / Tokens

| Constant | Value | Purpose |
|----------|-------|---------|
| `SHUTDOWN_OPTIONS` | `'SHUTDOWN_OPTIONS'` | Injection token for the `ShutdownOptions` object. |
| `DEFAULT_SHUTDOWN_TIMEOUT` | `30000` | Default force-exit timeout in ms. |
| `DEFAULT_SHUTDOWN_SIGNALS` | `['SIGTERM', 'SIGINT']` | Default OS signals handled. |

---

## Kubernetes Deployment Guide

For zero-downtime rolling deployments in Kubernetes:

```yaml
# deployment.yaml
spec:
  terminationGracePeriodSeconds: 35   # must be > timeout + preStop delay
  containers:
    - lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]
```

```ts
// AppModule
ShutdownModule.register({
  timeout: 25_000,        // 25s drain window (5s preStop + 25s + 5s buffer = 35s)
  drainStrategy: 'drain', // zero-downtime: wait for in-flight requests
})
```

Set `BOOT_PRESTOP_DELAY_MS=5000` in your pod env to match the `sleep 5` preStop hook. The 5-second preStop delay lets the load balancer remove the pod from the endpoint list before `SIGTERM` arrives.
