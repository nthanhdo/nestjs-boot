import type { CircuitBreakerState } from './interfaces';
import { CircuitBreakerStateChangeEvent } from './circuit-breaker-state-change.event';

/**
 * Optional prom-client — graceful no-op if not installed.
 */
let promClient: typeof import('prom-client') | undefined;
try {
  promClient = require('prom-client');
} catch {
  // prom-client not installed — metrics will be no-ops
}

interface NoopMetric {
  inc: () => void;
  set: (v: number) => void;
  labels: (...args: string[]) => NoopMetric;
}

const noopMetric: NoopMetric = {
  inc: () => {},
  set: () => {},
  labels: () => noopMetric,
};

/** Minimal EventBus shape to avoid hard dependency */
interface EventBusLike {
  emit(event: unknown): Promise<void> | void;
}

const STATE_VALUE: Record<CircuitBreakerState, number> = {
  CLOSED: 0,
  OPEN: 1,
  HALF_OPEN: 2,
};

/**
 * Encapsulates metrics + event emission for CircuitBreaker.
 * Designed to be shared across multiple breaker instances.
 */
export class CircuitBreakerObservability {
  private readonly stateGauge: NoopMetric;
  private readonly transitionsCounter: NoopMetric;
  private readonly failuresCounter: NoopMetric;

  constructor(private readonly eventBus?: EventBusLike) {
    if (promClient) {
      // Use a global registry so metrics survive multiple instantiations
      const existingState = this.findOrCreate(
        'boot_circuit_breaker_state',
        () =>
          new promClient!.Gauge({
            name: 'boot_circuit_breaker_state',
            help: 'Current circuit breaker state (0=closed, 1=open, 2=half_open)',
            labelNames: ['name', 'state'],
          }),
      );
      const existingTransitions = this.findOrCreate(
        'boot_circuit_breaker_transitions_total',
        () =>
          new promClient!.Counter({
            name: 'boot_circuit_breaker_transitions_total',
            help: 'Circuit breaker state transition count',
            labelNames: ['name', 'from', 'to'],
          }),
      );
      const existingFailures = this.findOrCreate(
        'boot_circuit_breaker_failures_total',
        () =>
          new promClient!.Counter({
            name: 'boot_circuit_breaker_failures_total',
            help: 'Circuit breaker failure count',
            labelNames: ['name'],
          }),
      );
      this.stateGauge = existingState as NoopMetric;
      this.transitionsCounter = existingTransitions as NoopMetric;
      this.failuresCounter = existingFailures as NoopMetric;
    } else {
      this.stateGauge = noopMetric;
      this.transitionsCounter = noopMetric;
      this.failuresCounter = noopMetric;
    }
  }

  onStateChange(
    name: string,
    previousState: CircuitBreakerState,
    newState: CircuitBreakerState,
    failureCount: number,
  ): void {
    // Update state gauge — set new state to its value, reset others to 0
    for (const [state, value] of Object.entries(STATE_VALUE)) {
      this.stateGauge.labels(name, state).set(state === newState ? value : 0);
    }

    // Increment transition counter (skip the initial CLOSED→CLOSED pseudo-transition)
    if (previousState !== newState) {
      this.transitionsCounter.labels(name, previousState, newState).inc();
    }

    // Emit event
    if (this.eventBus && previousState !== newState) {
      const event = new CircuitBreakerStateChangeEvent(
        name,
        previousState,
        newState,
        failureCount,
      );
      // Fire-and-forget — don't block the breaker
      Promise.resolve(this.eventBus.emit(event)).catch(() => {});
    }
  }

  onFailure(name: string): void {
    this.failuresCounter.labels(name).inc();
  }

  private findOrCreate(name: string, factory: () => unknown): unknown {
    try {
      return promClient!.register.getSingleMetric(name) ?? factory();
    } catch {
      return factory();
    }
  }
}
