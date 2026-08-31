import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { InFlightTracker } from './in-flight-tracker';

@Injectable()
export class InFlightInterceptor implements NestInterceptor {
  constructor(private readonly tracker: InFlightTracker) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    this.tracker.increment();
    return next.handle().pipe(finalize(() => this.tracker.decrement()));
  }
}
