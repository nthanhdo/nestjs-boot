import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/**
 * Structured error response shape.
 */
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  /** Stable machine-readable error code (from BootException) */
  code?: string;
  details?: unknown[];
  timestamp: string;
  path: string;
}

/**
 * AllExceptionsFilter — catch-all exception filter.
 *
 * - HttpException → extract status + message
 * - ValidationPipe errors → extract details array
 * - Unknown errors → 500 Internal Server Error
 * - Always includes timestamp + request path
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void | Record<string, unknown> {
    const contextType = host.getType();

    // For non-HTTP contexts (RPC, WS), return a structured error object
    // instead of calling switchToHttp() which would crash.
    if (contextType !== 'http') {
      const errorObj = this.buildErrorObject(exception, contextType);
      this.logger.error(
        `Exception in ${contextType} context: ${errorObj.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      // For RPC contexts, throwing the error lets NestJS RpcExceptionFilter handle it
      if (contextType === 'rpc') {
        throw exception;
      }
      return errorObj;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    const errorObj = this.buildErrorObject(exception, contextType);

    const errorResponse: ErrorResponse = {
      ...errorObj,
      timestamp: new Date().toISOString(),
      path: request.url ?? request.path ?? '/',
    };

    response.status(errorObj.statusCode).json(errorResponse);
  }

  private buildErrorObject(
    exception: unknown,
    _contextType: string,
  ): { statusCode: number; message: string; error: string; code?: string; details?: unknown[] } {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let error = 'InternalServerError';
    let details: unknown[] | undefined;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exResponse = exception.getResponse();
      error = exception.constructor.name;

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const resp = exResponse as Record<string, unknown>;
        message = (resp.message as string) ?? exception.message;

        // ValidationPipe errors come as { message: string[], error: string }
        if (Array.isArray(resp.message)) {
          details = resp.message;
          message = 'Validation failed';
        }
        if (resp.error && typeof resp.error === 'string') {
          error = resp.error;
        }
        if (typeof resp.code === 'string') {
          code = resp.code;
        }
      }
      // BootException has code as a property
      if ((exception as any).code && typeof (exception as any).code === 'string') {
        code = (exception as any).code;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error('Unknown exception', exception);
    }

    return { statusCode, message, error, ...(code ? { code } : {}), ...(details ? { details } : {}) };
  }
}
