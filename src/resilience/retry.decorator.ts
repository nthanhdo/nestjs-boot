import { Logger } from '@nestjs/common';
import type { RetryOptions } from './interfaces';
import {
  DEFAULT_RETRY_MAX_ATTEMPTS,
  DEFAULT_RETRY_DELAY,
  DEFAULT_RETRY_MAX_DELAY,
} from './constants';

const logger = new Logger('Retry');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(
  attempt: number,
  backoff: 'fixed' | 'exponential',
  baseDelay: number,
  maxDelay: number,
): number {
  if (backoff === 'fixed') {
    return Math.min(baseDelay, maxDelay);
  }
  // Exponential with jitter: delay * 2^attempt + random(0, delay/2)
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * (baseDelay / 2);
  return Math.min(exponential + jitter, maxDelay);
}

/**
 * Method decorator that retries failed async method calls with configurable backoff.
 */
export function Retry(options?: RetryOptions): MethodDecorator {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS;
  const backoff = options?.backoff ?? 'exponential';
  const delay = options?.delay ?? DEFAULT_RETRY_DELAY;
  const maxDelay = options?.maxDelay ?? DEFAULT_RETRY_MAX_DELAY;
  const retryOn = options?.retryOn;

  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const methodName = String(propertyKey);

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error as Error;

          if (retryOn && !retryOn(lastError)) {
            throw lastError;
          }

          if (attempt < maxAttempts - 1) {
            const waitTime = computeDelay(attempt, backoff, delay, maxDelay);
            logger.warn(
              `${methodName} attempt ${attempt + 1}/${maxAttempts} failed, retrying in ${Math.round(waitTime)}ms: ${lastError.message}`,
            );
            await sleep(waitTime);
          }
        }
      }

      logger.error(`${methodName} failed after ${maxAttempts} attempts`);
      throw lastError;
    };

    return descriptor;
  };
}
