export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before transitioning from OPEN to HALF_OPEN (default: 30000) */
  resetTimeout?: number;
  /** Max requests allowed in HALF_OPEN state (default: 1) */
  halfOpenMax?: number;
}

export interface RetryOptions {
  /** Maximum number of attempts including the first call (default: 3) */
  maxAttempts?: number;
  /** Backoff strategy (default: 'exponential') */
  backoff?: 'fixed' | 'exponential';
  /** Base delay in ms (default: 1000) */
  delay?: number;
  /** Maximum delay in ms (default: 10000) */
  maxDelay?: number;
  /** Predicate to decide whether to retry on a given error (default: always retry) */
  retryOn?: (error: Error) => boolean;
}

export interface ResilienceOptions {
  circuitBreaker?: CircuitBreakerOptions;
  timeout?: {
    /** Default timeout in ms (default: 30000) */
    default?: number;
  };
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
