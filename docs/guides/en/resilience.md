# Resilience

nestjs-boot provides three resilience patterns as decorators: circuit breaker, retry with backoff, and timeout. They can be combined on the same method for layered fault tolerance.

## Circuit Breaker

Prevents cascading failures by tracking consecutive errors and temporarily blocking calls to a failing dependency.

### States

- **CLOSED** (normal): requests pass through. Failures increment a counter.
- **OPEN** (tripped): all requests immediately throw `CircuitBreakerOpenError`. After `resetTimeout` ms, transitions to HALF_OPEN.
- **HALF_OPEN** (probing): allows `halfOpenMax` requests through. If one succeeds, transitions back to CLOSED. If one fails, transitions back to OPEN.

### Usage as a Decorator

```ts
import { CircuitBreakerDecorator } from 'nestjs-boot/resilience';

@Injectable()
export class PaymentGateway {
  @CircuitBreakerDecorator({
    failureThreshold: 5,   // open after 5 consecutive failures
    resetTimeout: 30_000,  // try again after 30s
    halfOpenMax: 1,        // allow 1 probe request
  })
  async charge(amount: number): Promise<Receipt> {
    return this.httpClient.post('/charge', { amount });
  }
}
```

Each decorated method gets its own `CircuitBreaker` instance. The instance is accessible for testing via `method.__circuitBreaker`.

### Usage as a Class

For programmatic control (e.g., wrapping a third-party SDK):

```ts
import { CircuitBreaker, CircuitBreakerOpenError } from 'nestjs-boot/resilience';

const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 10_000 });

try {
  const result = await breaker.execute(() => externalApi.call());
} catch (err) {
  if (err instanceof CircuitBreakerOpenError) {
    // Circuit is open — return cached/fallback data
    return fallbackData;
  }
  throw err;
}

// Inspect and reset
console.log(breaker.getState()); // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
breaker.reset(); // force back to CLOSED
```

### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `failureThreshold` | `number` | `5` | Failures before opening |
| `resetTimeout` | `number` | `30000` | Ms before OPEN transitions to HALF_OPEN |
| `halfOpenMax` | `number` | `1` | Probe requests allowed in HALF_OPEN |

## Retry

Retries failed async calls with configurable backoff strategy and optional error filtering.

```ts
import { Retry } from 'nestjs-boot/resilience';

@Injectable()
export class InventoryService {
  @Retry({
    maxAttempts: 3,
    backoff: 'exponential',  // or 'fixed'
    delay: 1000,             // base delay in ms
    maxDelay: 10_000,        // cap for exponential growth
  })
  async checkStock(sku: string): Promise<number> {
    return this.warehouseApi.getStock(sku);
  }
}
```

### Selective Retry

Use `retryOn` to only retry specific errors:

```ts
@Retry({
  maxAttempts: 4,
  backoff: 'exponential',
  delay: 500,
  retryOn: (error) => {
    // Only retry network/timeout errors, not 4xx
    return error.message.includes('ECONNREFUSED')
        || error.message.includes('timeout');
  },
})
async fetchPrice(id: string): Promise<Price> {
  return this.pricingApi.get(id);
}
```

If `retryOn` returns `false`, the error is thrown immediately without further retries.

### Backoff Behavior

- **fixed**: waits `min(delay, maxDelay)` between every attempt.
- **exponential**: waits `min(delay * 2^attempt + jitter, maxDelay)`. Jitter is `random(0, delay/2)` to prevent thundering herd.

### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | `number` | `3` | Total attempts including first call |
| `backoff` | `'fixed' \| 'exponential'` | `'exponential'` | Backoff strategy |
| `delay` | `number` | `1000` | Base delay in ms |
| `maxDelay` | `number` | `10000` | Maximum delay cap in ms |
| `retryOn` | `(error: Error) => boolean` | always retry | Predicate to filter retryable errors |

## Timeout

Sets a per-route or global request timeout. Uses RxJS `timeout` operator with NestJS interceptor.

### Global Setup

```ts
import { TimeoutInterceptor, RESILIENCE_OPTIONS } from 'nestjs-boot/resilience';

@Module({
  providers: [
    {
      provide: RESILIENCE_OPTIONS,
      useValue: { timeout: { default: 15_000 } }, // 15s global default
    },
  ],
})
export class AppModule {}

// Register globally
app.useGlobalInterceptors(app.get(TimeoutInterceptor));
```

### Per-Route Override

```ts
import { Timeout } from 'nestjs-boot/resilience';

@Controller('reports')
export class ReportsController {
  @Get('monthly')
  @Timeout(60_000) // 60s for this slow endpoint
  generateMonthlyReport() { ... }

  @Get('summary')
  @Timeout(5_000) // 5s for this fast endpoint
  getSummary() { ... }
}
```

When a timeout fires, the interceptor throws `RequestTimeoutException` (HTTP 408) with the message `Request timed out after Xms`.

The default timeout is 30,000ms if no `RESILIENCE_OPTIONS` are provided.

## Combining Patterns

Stack decorators on a single method. The outermost decorator executes first:

```ts
@Injectable()
export class ExternalApiService {
  @Retry({ maxAttempts: 3, delay: 500 })
  @CircuitBreakerDecorator({ failureThreshold: 5, resetTimeout: 30_000 })
  async fetchData(id: string): Promise<Data> {
    return this.httpClient.get(`/data/${id}`);
  }
}
```

Execution order: Retry wraps CircuitBreaker wraps the actual call.

- If the circuit is OPEN, `CircuitBreakerOpenError` is thrown. Retry sees it and retries (the circuit may transition to HALF_OPEN during the retry delay).
- If the call fails for other reasons, the circuit breaker records the failure, and retry handles the backoff.

For timeout + retry, use the `@Timeout` decorator on the controller route (interceptor level) and `@Retry` on the service method:

```ts
// Controller — timeout the entire request
@Get(':id')
@Timeout(10_000)
getData(@Param('id') id: string) {
  return this.service.fetchData(id);
}

// Service — retry individual calls
@Retry({ maxAttempts: 3 })
@CircuitBreakerDecorator({ failureThreshold: 5 })
async fetchData(id: string) { ... }
```

## Best Practices

- Set `failureThreshold` based on your dependency's expected error rate. Too low causes false trips; too high delays detection.
- Use exponential backoff for external APIs to avoid overwhelming a recovering service.
- Always provide a `retryOn` predicate for HTTP calls. Retrying a 400 Bad Request wastes time and resources.
- Combine circuit breaker + retry for external dependencies, timeout for request-level SLA enforcement.
- Monitor circuit breaker state transitions in logs (the class logs `CLOSED -> OPEN` etc. via NestJS Logger).

## Common Pitfalls

- **Retrying non-idempotent operations** — Without a `retryOn` predicate, `@Retry` retries all errors including 400/403/404. Always filter to transient errors only.
- **Timeout + retry interaction** — If the `@Timeout` on a controller is shorter than `maxAttempts * maxDelay`, the timeout fires before retries complete. Set the route timeout to exceed the worst-case retry duration.
- **Circuit breaker per-instance, not global** — Each decorated method gets its own `CircuitBreaker` instance. If you have 10 pods, each has an independent breaker. A failing dependency must trip the breaker on each pod separately.

## See also

- [Transport & Microservices](transport-microservices.md) — `ResilientServiceClient` wraps these patterns for inter-service calls
- [Transport Selection Guide](transport-selection.md) — when to add resilience per transport type
- [Error Handling](error-handling.md) — `CircuitBreakerOpenError` and error boundary patterns
