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

  /**
   * Optional error reporter callback — called for every caught exception.
   * Set this to integrate Sentry, Datadog, etc. without subclassing.
   *
   * ```ts
   * AllExceptionsFilter.errorReporter = (error, context) => {
   *   Sentry.captureException(error, { extra: context });
   * };
   * ```
   */
  static errorReporter?: (error: Error, context: { statusCode: number; path: string; contextType: string }) => void;

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
      // Call error reporter if configured
      if (AllExceptionsFilter.errorReporter && exception instanceof Error) {
        try {
          AllExceptionsFilter.errorReporter(exception, {
            statusCode: errorObj.statusCode,
            path: '',
            contextType,
          });
        } catch {
          // Never let reporter crash the filter
        }
      }
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
    const path = request.url ?? request.path ?? '/';

    // Call error reporter if configured
    if (AllExceptionsFilter.errorReporter && exception instanceof Error) {
      try {
        AllExceptionsFilter.errorReporter(exception, {
          statusCode: errorObj.statusCode,
          path,
          contextType,
        });
      } catch {
        // Never let reporter crash the filter
      }
    }

    const errorResponse: ErrorResponse = {
      ...errorObj,
      timestamp: new Date().toISOString(),
      path,
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
