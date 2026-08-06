import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { TIMEOUT_KEY, RESILIENCE_OPTIONS, DEFAULT_TIMEOUT } from './constants';
import type { ResilienceOptions } from './interfaces';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeout: number;

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(RESILIENCE_OPTIONS)
    resilienceOptions?: ResilienceOptions,
  ) {
    this.defaultTimeout = resilienceOptions?.timeout?.default ?? DEFAULT_TIMEOUT;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const routeTimeout = this.reflector.get<number>(
      TIMEOUT_KEY,
      context.getHandler(),
    );
    const ms = routeTimeout ?? this.defaultTimeout;

    return next.handle().pipe(
      timeout(ms),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException(
            `Request timed out after ${ms}ms`,
          ));
        }
        return throwError(() => err);
      }),
    );
  }
}
