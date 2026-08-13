import { BootEvent } from '../events/boot-event';
import type { CircuitBreakerState } from './interfaces';

/**
 * Emitted when a CircuitBreaker transitions between states.
 * Subscribe via @OnEvent(CircuitBreakerStateChangeEvent) or EventBusService.on().
 */
export class CircuitBreakerStateChangeEvent extends BootEvent {
  constructor(
    public readonly breakerName: string,
    public readonly previousState: CircuitBreakerState,
    public readonly newState: CircuitBreakerState,
    public readonly failureCount: number,
  ) {
    super();
  }
}
