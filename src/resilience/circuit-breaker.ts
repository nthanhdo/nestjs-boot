import { Logger } from '@nestjs/common';
import type { CircuitBreakerOptions, CircuitBreakerState } from './interfaces';
import {
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_RESET_TIMEOUT,
  DEFAULT_HALF_OPEN_MAX,
} from './constants';
import type { CircuitBreakerObservability } from './circuit-breaker-observability';

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private halfOpenAttempts = 0;
  private nextAttemptTime = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenMax: number;
  private readonly name: string;
  private readonly observability?: CircuitBreakerObservability;

  constructor(options: CircuitBreakerOptions = {}, observability?: CircuitBreakerObservability) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeout = options.resetTimeout ?? DEFAULT_RESET_TIMEOUT;
    this.halfOpenMax = options.halfOpenMax ?? DEFAULT_HALF_OPEN_MAX;
    this.name = options.name ?? 'default';
    this.observability = observability;

    // Set initial state metric
    this.observability?.onStateChange(this.name, 'CLOSED', 'CLOSED', 0);
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  reset(): void {
    this.transitionTo('CLOSED');
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = 0;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo('HALF_OPEN');
        this.halfOpenAttempts = 0;
      } else {
        throw new CircuitBreakerOpenError();
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.halfOpenMax) {
      throw new CircuitBreakerOpenError('Circuit breaker is OPEN (half-open limit reached)');
    }

    try {
      if (this.state === 'HALF_OPEN') {
        this.halfOpenAttempts++;
      }
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.observability?.onFailure(this.name);
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
      return;
    }
    if (this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state === newState) return;
    const previousState = this.state;
    this.logger.log(`Circuit breaker: ${previousState} → ${newState}`);
    this.state = newState;
    if (newState === 'OPEN') {
      this.nextAttemptTime = Date.now() + this.resetTimeout;
    }
    this.observability?.onStateChange(this.name, previousState, newState, this.failureCount);
  }
}
