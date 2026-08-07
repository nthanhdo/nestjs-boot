import { HttpException, HttpStatus } from '@nestjs/common';
import type { RpcErrorEnvelope } from './rpc-exception.filter';
import { grpcStatusToHttp } from './grpc-status-map';

/**
 * Check if an unknown value looks like a serialized RpcErrorEnvelope.
 */
function isRpcErrorEnvelope(
  value: unknown,
): value is RpcErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as any).statusCode === 'number' &&
    typeof (value as any).message === 'string'
  );
}

/**
 * Deserialize a serialized RPC error back into a proper NestJS HttpException.
 *
 * Use this at the API gateway / calling service side inside a client interceptor
 * to re-throw received RPC errors as HttpExceptions the HTTP layer understands.
 *
 * If the error has a gRPC `code` field instead of `statusCode`, it maps
 * the gRPC status to an HTTP status automatically.
 *
 * @example
 * ```ts
 * // In a ClientProxy interceptor or catch block:
 * catchError((err) => {
 *   throw deserializeRpcError(err);
 * })
 * ```
 */
export function deserializeRpcError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  if (isRpcErrorEnvelope(error)) {
    const { statusCode, message, error: errorType, code, details, causes, correlationId } = error as any;

    return new HttpException(
      {
        statusCode,
        message,
        error: errorType,
        ...(code ? { code } : {}),
        ...(details ? { details } : {}),
        ...(causes ? { causes } : {}),
        ...(correlationId ? { correlationId } : {}),
      },
      statusCode,
    );
  }

  // Handle gRPC-style errors with `code` field
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as any).code === 'number'
  ) {
    const grpcErr = error as { code: number; message?: string; details?: string };
    const httpStatus = grpcStatusToHttp(grpcErr.code);

    // Try to parse details as the original envelope
    if (grpcErr.details) {
      try {
        const parsed = JSON.parse(grpcErr.details);
        if (isRpcErrorEnvelope(parsed)) {
          return deserializeRpcError(parsed);
        }
      } catch {
        // details is not JSON, use as message
      }
    }

    return new HttpException(
      {
        statusCode: httpStatus,
        message: grpcErr.message ?? 'Unknown RPC error',
        error: 'RpcError',
      },
      httpStatus,
    );
  }

  // Check if it's an envelope with causes (error hop chain)
  if (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as any).causes)
  ) {
    const envelope = error as any;
    const httpStatus = envelope.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR;
    return new HttpException(
      {
        statusCode: httpStatus,
        message: envelope.message ?? 'Unknown RPC error',
        error: envelope.error ?? 'RpcError',
        ...(envelope.code ? { code: envelope.code } : {}),
        ...(envelope.causes ? { causes: envelope.causes } : {}),
      },
      httpStatus,
    );
  }

  // Fallback: unknown shape
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown RPC error';

  return new HttpException(
    {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error: 'InternalServerError',
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

/** HTTP status codes that indicate a retryable error. */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 503, 504]);

/**
 * Check if an error is retryable based on its HTTP status code.
 * Retryable codes: 408 (Timeout), 429 (Too Many Requests), 503 (Service Unavailable), 504 (Gateway Timeout).
 *
 * Works with HttpException, RpcErrorEnvelope, or plain objects with statusCode.
 *
 * ```ts
 * catchError((err) => {
 *   if (isRetryable(err)) {
 *     return retry({ count: 3, delay: 1000 })(source);
 *   }
 *   throw deserializeRpcError(err);
 * })
 * ```
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof HttpException) {
    return RETRYABLE_STATUS_CODES.has(error.getStatus());
  }

  if (typeof error === 'object' && error !== null) {
    const statusCode = (error as any).statusCode ?? (error as any).status;
    if (typeof statusCode === 'number') {
      return RETRYABLE_STATUS_CODES.has(statusCode);
    }
  }

  return false;
}
