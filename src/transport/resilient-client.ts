import { TimeoutError } from 'rxjs';
import { Logger } from '@nestjs/common';
import { CircuitBreaker, CircuitBreakerOpenError } from '../resilience/circuit-breaker';
import type { CircuitBreakerOptions, RetryOptions } from '../resilience/interfaces';
import { ServiceClient } from './service-client';

export interface ResilientClientOptions {
  /**
   * Per-call timeout in milliseconds.
   * The call is rejected if the downstream service does not respond within this window.
   *
   * @default undefined (no timeout)
   */
  timeout?: number;

  /**
   * Retry configuration. When set, failed calls are retried with optional backoff.
   *
   * @example { maxAttempts: 3, backoff: 'exponential' }
   */
  retry?: RetryOptions;

  /**
   * Circuit breaker configuration. After `failureThreshold` consecutive failures
   * the circuit opens and all further calls fail fast until the reset window elapses.
   *
   * @example { failureThreshold: 5, resetTimeout: 30000 }
   */
  circuitBreaker?: CircuitBreakerOptions;
}

type ServiceInterface = Record<string, (...args: any[]) => any>;

/**
 * Wraps a NestJS `ClientProxy` with per-call timeout, retry with backoff,
 * and a circuit breaker — all optional, all composable.
 *
 * Auth and correlation ID forwarding are inherited from the underlying
 * `ServiceClient<T>` — no extra configuration needed.
 *
 * ```ts
 * // In your module / provider
 * const resilient = createResilientClient<OrderService>(clientProxy, {
 *   timeout: 5000,
 *   retry: { maxAttempts: 3, backoff: 'exponential' },
 *   circuitBreaker: { failureThreshold: 5 },
 * });
 *
 * // In your service
 * const order = await resilient.call('findOrder', { id: '123' });
 * // ↑ Auto-retries on timeout, opens circuit after 5 consecutive failures,
 * //   forwards correlationId + auth from AsyncLocalStorage automatically.
 * ```
 *
 * The composition order (outer → inner) is:
 *   circuit-breaker → retry → timeout → correlation + auth → send
 */
export function createResilientClient<T extends ServiceInterface>(
  client: { send: (pattern: any, data: any) => any },
  options: ResilientClientOptions,
): ResilientServiceClient<T> {
  return new ResilientServiceClient<T>(client, options);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffDelay(attempt: number, opts: RetryOptions): number {
  const base = opts.delay ?? 1000;
  const max = opts.maxDelay ?? 10_000;
  if ((opts.backoff ?? 'exponential') === 'fixed') {
    return Math.min(base, max);
  }
  // Exponential with jitter
  const exponential = base * Math.pow(2, attempt);
  const jitter = Math.random() * (base / 2);
  return Math.min(exponential + jitter, max);
}

export class ResilientServiceClient<T extends ServiceInterface> extends ServiceClient<T> {
  private readonly logger = new Logger(ResilientServiceClient.name);
  private readonly circuitBreaker: CircuitBreaker | undefined;
  private readonly options: ResilientClientOptions;

  constructor(
    client: { send: (pattern: any, data: any) => any },
    options: ResilientClientOptions,
  ) {
    super(client);
    this.options = options;

    if (options.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    }
  }

  /**
   * Call a remote service method with resilience: timeout + retry + circuit breaker.
   * Auth context and correlation ID are forwarded automatically (from ServiceClient).
   */
  override async call<K extends keyof T & string>(
    method: K,
    data: Parameters<T[K]>[0],
  ): Promise<ReturnType<T[K]>> {
    const execute = () => this._callWithTimeout(method, data);

    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(() => this._callWithRetry(execute, method as string));
    }

    return this._callWithRetry(execute, method as string);
  }

  // ── private helpers ──────────────────────────────────────────────────────────

  private async _callWithRetry<R>(fn: () => Promise<R>, label = 'call'): Promise<R> {
    const retry = this.options.retry;
    if (!retry) return fn();

    const maxAttempts = retry.maxAttempts ?? 3;
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err as Error;

        // Don't retry circuit breaker open — propagate immediately
        if (err instanceof CircuitBreakerOpenError) throw err;

        if (retry.retryOn && !retry.retryOn(lastError)) {
          throw lastError;
        }

        const isLastAttempt = attempt === maxAttempts - 1;
        if (!isLastAttempt) {
          const delay = computeBackoffDelay(attempt, retry);
          this.logger.warn(
            `[${label}] attempt ${attempt + 1}/${maxAttempts} failed — retrying in ${Math.round(delay)}ms`,
          );
          await sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private async _callWithTimeout<K extends keyof T & string>(
    method: K,
    data: Parameters<T[K]>[0],
  ): Promise<ReturnType<T[K]>> {
    const timeoutMs = this.options.timeout;

    if (!timeoutMs) {
      return super.call(method, data);
    }

    // Re-apply metadata injection via parent's call, but we need the raw
    // observable to apply RxJS timeout.  We reconstruct here to avoid
    // duplicating metadata logic.
    try {
      const result = await Promise.race([
        super.call(method, data),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new TimeoutError()),
            timeoutMs,
          ),
        ),
      ]);
      return result as ReturnType<T[K]>;
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new Error(`[${method}] timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  /** Circuit breaker state — useful for health checks / dashboards */
  getCircuitState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'DISABLED' {
    return this.circuitBreaker?.getState() ?? 'DISABLED';
  }
}
