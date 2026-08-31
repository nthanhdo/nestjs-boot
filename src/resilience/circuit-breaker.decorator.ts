import { CircuitBreaker } from './circuit-breaker';
import type { CircuitBreakerOptions } from './interfaces';
import type { CircuitBreakerObservability } from './circuit-breaker-observability';

/**
 * Shared registry — methods with the same `name` share circuit breaker state.
 */
const breakerRegistry = new Map<string, CircuitBreaker>();

function getOrCreateBreaker(
  options: CircuitBreakerOptions = {},
  observability?: CircuitBreakerObservability,
): CircuitBreaker {
  const name = options.name ?? 'default';
  if (!breakerRegistry.has(name)) {
    breakerRegistry.set(name, new CircuitBreaker(options, observability));
  }
  return breakerRegistry.get(name)!;
}

/**
 * Method decorator that wraps an async method with a circuit breaker.
 * Methods sharing the same `name` option share circuit breaker state.
 */
export function CircuitBreakerDecorator(
  options?: CircuitBreakerOptions,
  observability?: CircuitBreakerObservability,
): MethodDecorator {
  const breaker = getOrCreateBreaker(options, observability);

  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return breaker.execute(() => originalMethod.apply(this, args));
    };

    // Attach breaker instance for testing/inspection
    (descriptor.value as Record<string, unknown>).__circuitBreaker = breaker;

    return descriptor;
  };
}

// Re-export with a cleaner name
export { CircuitBreakerDecorator as CircuitBreaker };
