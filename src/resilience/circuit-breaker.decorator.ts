import { CircuitBreaker } from './circuit-breaker';
import type { CircuitBreakerOptions } from './interfaces';

/**
 * Method decorator that wraps an async method with a circuit breaker.
 * Each decorated method gets its own CircuitBreaker instance.
 */
export function CircuitBreakerDecorator(
  options?: CircuitBreakerOptions,
): MethodDecorator {
  const breaker = new CircuitBreaker(options);

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
