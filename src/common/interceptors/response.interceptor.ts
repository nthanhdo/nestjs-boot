import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Response envelope shape.
 */
export interface ResponseEnvelope<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
  total?: number;
  page?: number;
  limit?: number;
}

/**
 * Paginated response shape from handlers that return pagination metadata.
 */
interface PaginatedResponse {
  data: unknown;
  total: number;
  page: number;
  limit: number;
}

function isPaginated(value: unknown): value is PaginatedResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'total' in value &&
    'page' in value &&
    'limit' in value
  );
}

function isAlreadyEnveloped(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'statusCode' in value;
}

/**
 * ResponseInterceptor — wraps handler responses into a unified envelope.
 *
 * - If handler returns `{ data, total, page, limit }` → spread into envelope
 * - If handler returns plain object/array → wrap as `{ data: result }`
 * - Skip if response is already enveloped (has statusCode field)
 *
 * Opt-in via `response.envelope: true` in BootOptions.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T>> {
    const response = context.switchToHttp().getResponse();
    const statusCode: number = response.statusCode ?? 200;

    return next.handle().pipe(
      map((result) => {
        // Already enveloped — pass through
        if (isAlreadyEnveloped(result)) {
          return result as unknown as ResponseEnvelope<T>;
        }

        // Paginated response
        if (isPaginated(result)) {
          return {
            statusCode,
            message: 'Success',
            data: result.data as T,
            total: result.total,
            page: result.page,
            limit: result.limit,
          };
        }

        // Plain response
        return {
          statusCode,
          message: 'Success',
          data: result as T,
        };
      }),
    );
  }
}
