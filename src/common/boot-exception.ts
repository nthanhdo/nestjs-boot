import { HttpException, HttpStatus } from '@nestjs/common';

export interface BootExceptionOptions {
  /** Stable error code (e.g., 'PRODUCT_NOT_FOUND', 'INSUFFICIENT_STOCK') */
  code?: string;
  /** HTTP status code (default: 500) */
  status?: number;
  /** Additional error details */
  details?: unknown[];
}

/**
 * BootException — extends HttpException with a stable `code` field.
 *
 * The `code` field is a machine-readable error identifier that clients can
 * switch on, decoupled from the human-readable `message` which may change.
 *
 * ```ts
 * throw new BootException('Product not found', {
 *   code: 'PRODUCT_NOT_FOUND',
 *   status: 404,
 * });
 *
 * throw new BootException('Insufficient stock', {
 *   code: 'INSUFFICIENT_STOCK',
 *   status: 409,
 *   details: [{ sku: 'ABC123', available: 2, requested: 5 }],
 * });
 * ```
 */
export class BootException extends HttpException {
  public readonly code: string | undefined;
  public readonly details: unknown[] | undefined;

  constructor(message: string, options?: BootExceptionOptions) {
    const status = options?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const response: Record<string, any> = {
      statusCode: status,
      message,
      error: 'BootException',
    };
    if (options?.code) {
      response.code = options.code;
    }
    if (options?.details) {
      response.details = options.details;
    }
    super(response, status);
    this.code = options?.code;
    this.details = options?.details;
  }
}
