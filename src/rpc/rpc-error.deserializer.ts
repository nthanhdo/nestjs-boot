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
    const { statusCode, message, error: errorType, details, correlationId } = error;

    return new HttpException(
      {
        statusCode,
        message,
        error: errorType,
        ...(details ? { details } : {}),
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
