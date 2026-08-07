/**
 * error-boundary.ts — async operation error boundary.
 *
 * Wraps async operations with consistent error handling: catches errors,
 * wraps them in BootException with a stable code, and either rethrows or
 * returns a fallback value.
 *
 * ```ts
 * // Rethrow as BootException (default)
 * const order = await errorBoundary(
 *   () => this.orderService.create(data),
 *   { code: 'ORDER_CREATE_FAILED', status: 500 },
 * );
 *
 * // Return null on failure (never throws)
 * const cached = await errorBoundary(
 *   () => this.cache.get(key),
 *   { code: 'CACHE_MISS', fallback: null },
 * );
 *
 * // Custom error transform
 * const user = await errorBoundary(
 *   () => this.userService.findById(id),
 *   {
 *     code: 'USER_NOT_FOUND',
 *     status: 404,
 *     transform: (err) => err.message.includes('not found'),
 *   },
 * );
 * ```
 */

import { HttpStatus } from '@nestjs/common';
import { BootException } from './boot-exception';

export interface ErrorBoundaryOptions<T> {
  /**
   * Stable error code applied to the wrapped BootException.
   * Forwarded to the client as `code` in the error envelope.
   */
  code: string;

  /**
   * HTTP status code for the thrown BootException (default: 500).
   * Only relevant when `rethrow` is true (the default).
   */
  status?: number;

  /**
   * If provided, return this value instead of throwing when the operation
   * fails. Setting a fallback implies `rethrow: false`.
   */
  fallback?: T;

  /**
   * Whether to rethrow as BootException after catching (default: true).
   * Set to false (or provide a fallback) to silently absorb failures.
   */
  rethrow?: boolean;

  /**
   * Optional predicate — if it returns `false`, the original error is
   * rethrown as-is (not wrapped). Useful to let specific errors pass through
   * (e.g., already-wrapped BootExceptions).
   */
  wrap?: (error: unknown) => boolean;
}

/**
 * Wraps an async operation with a consistent error boundary.
 *
 * @param fn - Async factory function to execute.
 * @param options - Error handling configuration.
 * @returns The resolved value of `fn`, or `options.fallback` on failure.
 * @throws BootException (or original error when `wrap` returns false) on failure.
 */
export async function errorBoundary<T>(
  fn: () => Promise<T>,
  options: ErrorBoundaryOptions<T>,
): Promise<T> {
  const {
    code,
    status = HttpStatus.INTERNAL_SERVER_ERROR,
    rethrow = options.fallback === undefined,
    wrap,
  } = options;

  try {
    return await fn();
  } catch (error: unknown) {
    // If a wrap predicate says not to wrap, rethrow original
    if (wrap && !wrap(error)) {
      throw error;
    }

    if (!rethrow) {
      // Return fallback (may be undefined if not set — caller opted out of throw)
      return options.fallback as T;
    }

    // If the error is already a BootException with a code, preserve it
    if (error instanceof BootException && error.code) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'An unexpected error occurred';

    throw new BootException(message, {
      code,
      status,
      // Preserve original error details if available
      details:
        error instanceof BootException && error.details
          ? error.details
          : undefined,
    });
  }
}

/**
 * Synchronous variant of errorBoundary for non-async operations.
 *
 * ```ts
 * const parsed = errorBoundarySync(
 *   () => JSON.parse(rawInput),
 *   { code: 'PARSE_FAILED', status: 400, fallback: null },
 * );
 * ```
 */
export function errorBoundarySync<T>(
  fn: () => T,
  options: ErrorBoundaryOptions<T>,
): T {
  const {
    code,
    status = HttpStatus.INTERNAL_SERVER_ERROR,
    rethrow = options.fallback === undefined,
    wrap,
  } = options;

  try {
    return fn();
  } catch (error: unknown) {
    if (wrap && !wrap(error)) {
      throw error;
    }

    if (!rethrow) {
      return options.fallback as T;
    }

    if (error instanceof BootException && error.code) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'An unexpected error occurred';

    throw new BootException(message, { code, status });
  }
}
