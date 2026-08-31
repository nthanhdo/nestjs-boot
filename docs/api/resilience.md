# Resilience API Reference

> Circuit breaker, retry with backoff, and per-route timeout decorators for fault-tolerant NestJS services.

## Classes

### `CircuitBreaker`

Stateful circuit breaker that transitions between `CLOSED → OPEN → HALF_OPEN` states. Each instance is independent. Can be used standalone or via `@CircuitBreaker()` decorator.

#### Constructor

```ts
constructor(options?: CircuitBreakerOptions, observability?: CircuitBreakerObservability)
```

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `execute` | `<T>(fn: () => Promise<T>): Promise<T>` | Execute `fn` through the circuit. Throws `CircuitBreakerOpenError` when the circuit is OPEN. |
| `getState` | `(): CircuitBreakerState` | Returns the current state: `'CLOSED'`, `'OPEN'`, or `'HALF_OPEN'`. |
| `reset` | `(): void` | Force the circuit back to CLOSED and reset all counters. |

**State transitions:**
- `CLOSED` → `OPEN`: failure count reaches `failureThreshold`
- `OPEN` → `HALF_OPEN`: `resetTimeout` ms have elapsed
- `HALF_OPEN` → `CLOSED`: probe call succeeds
- `HALF_OPEN` → `OPEN`: probe call fails, or `halfOpenMax` limit reached

#### `CircuitBreakerOpenError`

Thrown by `CircuitBreaker.execute()` when the circuit is open.

```ts
class CircuitBreakerOpenError extends Error {
  name: 'CircuitBreakerOpenError';
}
```

---

### `CircuitBreakerObservability`

Encapsulates Prometheus metrics and event emission for circuit breaker state changes. Designed to be shared across multiple breaker instances.

`prom-client` is loaded optionally — if not installed, all metric calls are no-ops.

#### Constructor

```ts
constructor(eventBus?: { emit(event: unknown): Promise<void> | void })
```

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `onStateChange` | `(name: string, previousState: CircuitBreakerState, newState: CircuitBreakerState, failureCount: number): void` | Updates gauges/counters and emits `CircuitBreakerStateChangeEvent` on state transitions. |
| `onFailure` | `(name: string): void` | Increments the per-breaker failure counter. |

**Prometheus metrics exposed (when `prom-client` is installed):**

| Metric | Type | Description |
|--------|------|-------------|
| `boot_circuit_breaker_state` | Gauge | Current state per breaker (0=closed, 1=open, 2=half_open). Labels: `name`, `state`. |
| `boot_circuit_breaker_transitions_total` | Counter | State transition count. Labels: `name`, `from`, `to`. |
| `boot_circuit_breaker_failures_total` | Counter | Failure count. Label: `name`. |

---

### `CircuitBreakerStateChangeEvent`

Event emitted by `CircuitBreakerObservability` on every state transition. Subscribe via your event bus.

```ts
class CircuitBreakerStateChangeEvent extends BootEvent {
  readonly breakerName: string;
  readonly previousState: CircuitBreakerState;
  readonly newState: CircuitBreakerState;
  readonly failureCount: number;
}
```

---

### `TimeoutInterceptor`

`@Injectable()` · `implements NestInterceptor`

Global HTTP interceptor that enforces a per-request timeout. Throws `RequestTimeoutException` (HTTP 408) when a route handler exceeds the limit.

#### Constructor

```ts
constructor(
  reflector: Reflector,
  @Optional() @Inject(RESILIENCE_OPTIONS) resilienceOptions?: ResilienceOptions,
)
```

Reads the global default from `resilienceOptions.timeout.default` (falls back to `DEFAULT_TIMEOUT = 30000 ms`). Per-route override is set via `@Timeout(ms)`.

#### Registration

```ts
// Global
app.useGlobalInterceptors(new TimeoutInterceptor(reflector));

// Per-module
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor }],
})
```

---

## Decorators

### `@CircuitBreaker(options?, observability?)`

**Method decorator.** Wraps an async method with a dedicated `CircuitBreaker` instance. Each decorated method owns its own breaker (not shared).

```ts
import { CircuitBreaker } from 'nestjs-boot';

@Injectable()
export class PaymentService {
  @CircuitBreaker({ name: 'payment-gateway', failureThreshold: 3, resetTimeout: 10_000 })
  async charge(amount: number): Promise<Receipt> {
    return this.gateway.charge(amount);
  }
}
```

The underlying `CircuitBreaker` instance is accessible for testing via `descriptor.value.__circuitBreaker`.

---

### `@Retry(options?)`

**Method decorator.** Retries a failed async method call with configurable backoff. Uses exponential backoff with jitter by default.

```ts
import { Retry } from 'nestjs-boot';

@Injectable()
export class NotificationService {
  @Retry({ maxAttempts: 5, backoff: 'exponential', delay: 500, maxDelay: 8_000 })
  async sendPush(payload: PushPayload): Promise<void> {
    await this.pushClient.send(payload);
  }
}
```

Backoff formula (exponential): `min(delay * 2^attempt + jitter(0..delay/2), maxDelay)`

---

### `@Timeout(ms: number)`

**Method decorator.** Sets a per-route timeout in milliseconds, overriding the global default when used alongside `TimeoutInterceptor`.

```ts
import { Timeout } from 'nestjs-boot';

@Get('slow-report')
@Timeout(60_000) // 60 seconds for this route only
async generateReport() { ... }
```

---

## Interfaces

### `CircuitBreakerOptions`

```ts
interface CircuitBreakerOptions {
  /** Name for metrics/logging (default: 'default') */
  name?: string;
  /** Failure count before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before OPEN → HALF_OPEN transition (default: 30000) */
  resetTimeout?: number;
  /** Max probe requests allowed in HALF_OPEN state (default: 1) */
  halfOpenMax?: number;
}
```

### `RetryOptions`

```ts
interface RetryOptions {
  /** Total attempts including the first call (default: 3) */
  maxAttempts?: number;
  /** Backoff strategy (default: 'exponential') */
  backoff?: 'fixed' | 'exponential';
  /** Base delay in ms (default: 1000) */
  delay?: number;
  /** Maximum delay cap in ms (default: 10000) */
  maxDelay?: number;
  /** Predicate to decide whether to retry — return false to stop retrying */
  retryOn?: (error: Error) => boolean;
}
```

### `ResilienceOptions`

```ts
interface ResilienceOptions {
  circuitBreaker?: CircuitBreakerOptions;
  timeout?: {
    /** Global default timeout in ms (default: 30000) */
    default?: number;
  };
}
```

### `CircuitBreakerState`

```ts
type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
```

---

## Constants / Tokens

| Constant | Value | Purpose |
|----------|-------|---------|
| `CIRCUIT_BREAKER_OPTIONS` | `Symbol('CIRCUIT_BREAKER_OPTIONS')` | Injection token for circuit breaker options. |
| `RESILIENCE_OPTIONS` | `Symbol('RESILIENCE_OPTIONS')` | Injection token for `ResilienceOptions` (read by `TimeoutInterceptor`). |
| `TIMEOUT_KEY` | `'nestjs-boot:timeout'` | Reflect metadata key set by `@Timeout`. |
| `DEFAULT_FAILURE_THRESHOLD` | `5` | Default failure count before opening the circuit. |
| `DEFAULT_RESET_TIMEOUT` | `30000` | Default ms before OPEN → HALF_OPEN. |
| `DEFAULT_HALF_OPEN_MAX` | `1` | Default max probe requests in HALF_OPEN. |
| `DEFAULT_TIMEOUT` | `30000` | Default request timeout in ms. |
| `DEFAULT_RETRY_MAX_ATTEMPTS` | `3` | Default retry attempts. |
| `DEFAULT_RETRY_DELAY` | `1000` | Default base retry delay in ms. |
| `DEFAULT_RETRY_MAX_DELAY` | `10000` | Default maximum retry delay cap in ms. |

---

## Optional Dependencies

| Package | When required |
|---------|---------------|
| `prom-client` | Optional — enables Prometheus metrics in `CircuitBreakerObservability`. |
