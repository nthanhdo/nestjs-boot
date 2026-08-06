import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { getCorrelationId } from '../correlation/correlation.storage';
import { httpStatusToGrpc, GrpcStatus } from './grpc-status-map';

/**
 * Structured RPC error envelope — mirrors the HTTP ErrorResponse shape
 * from AllExceptionsFilter for cross-transport consistency.
 */
export interface RpcErrorEnvelope {
  statusCode: number;
  message: string;
  error: string;
  details?: unknown[];
  correlationId?: string;
  timestamp: string;
  service?: string;
}

/**
 * Minimal interface for RpcException so we don't hard-depend on @nestjs/microservices.
 */
interface RpcExceptionLike {
  getError(): string | object;
  message?: string;
}

function isRpcExceptionLike(err: unknown): err is RpcExceptionLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as any).getError === 'function'
  );
}

/**
 * BootRpcExceptionFilter — standardized exception filter for microservice transports.
 *
 * Catches any exception in RPC context (gRPC, TCP, NATS, RMQ) and serializes
 * it to the same structured envelope used by the HTTP AllExceptionsFilter.
 *
 * Usage:
 * ```ts
 * @UseFilters(new BootRpcExceptionFilter({ serviceName: 'order-service' }))
 * @MessagePattern('create_order')
 * createOrder(data: CreateOrderDto) { ... }
 * ```
 *
 * Or register globally via RpcModule.register().
 */
@Catch()
export class BootRpcExceptionFilter {
  private readonly logger = new Logger('BootRpcExceptionFilter');
  private readonly serviceName?: string;

  constructor(options?: { serviceName?: string }) {
    this.serviceName = options?.serviceName;
  }

  catch(exception: unknown, _host: unknown): Observable<never> {
    const envelope = this.buildEnvelope(exception);

    this.logger.error(
      `RPC error [${envelope.statusCode}]: ${envelope.message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    return throwError(() => envelope);
  }

  /** @internal — build structured envelope from any exception type */
  buildEnvelope(exception: unknown): RpcErrorEnvelope {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let error = 'InternalServerError';
    let details: unknown[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exResponse = exception.getResponse();
      error = exception.constructor.name;

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const resp = exResponse as Record<string, unknown>;
        message = (resp.message as string) ?? exception.message;
        if (Array.isArray(resp.message)) {
          details = resp.message;
          message = 'Validation failed';
        }
        if (resp.error && typeof resp.error === 'string') {
          error = resp.error;
        }
      }
    } else if (isRpcExceptionLike(exception)) {
      const rpcError = exception.getError();
      if (typeof rpcError === 'string') {
        message = rpcError;
      } else if (typeof rpcError === 'object' && rpcError !== null) {
        const resp = rpcError as Record<string, unknown>;
        statusCode = (typeof resp.statusCode === 'number' ? resp.statusCode : statusCode);
        message = (typeof resp.message === 'string' ? resp.message : message);
        error = (typeof resp.error === 'string' ? resp.error : error);
        if (Array.isArray(resp.details)) {
          details = resp.details;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const correlationId = getCorrelationId();

    const envelope: RpcErrorEnvelope = {
      statusCode,
      message,
      error,
      ...(details ? { details } : {}),
      ...(correlationId ? { correlationId } : {}),
      timestamp: new Date().toISOString(),
      ...(this.serviceName ? { service: this.serviceName } : {}),
    };

    return envelope;
  }

  /**
   * Convert envelope to a gRPC-style error object with status code + details.
   * Useful when you need to throw gRPC-native errors.
   */
  static toGrpcError(envelope: RpcErrorEnvelope): {
    code: GrpcStatus;
    message: string;
    details: string;
  } {
    return {
      code: httpStatusToGrpc(envelope.statusCode),
      message: envelope.message,
      details: JSON.stringify(envelope),
    };
  }
}
