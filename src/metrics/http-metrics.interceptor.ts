import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly histogram: any;
  private readonly counter: any;

  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {
    this.histogram = this.metricsService.histogram(
      'http_request_duration_seconds',
      'Duration of HTTP requests in seconds',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      ['method', 'route', 'status_code'],
    );
    this.counter = this.metricsService.counter(
      'http_requests_total',
      'Total number of HTTP requests',
      ['method', 'route', 'status_code'],
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const route = req.route?.path ?? req.path ?? 'unknown';
    const end = this.histogram.startTimer({ method, route });

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const statusCode = String(res.statusCode);
          end({ status_code: statusCode });
          this.counter.inc({ method, route, status_code: statusCode });
        },
        error: (err: any) => {
          const statusCode = String(err.status ?? err.statusCode ?? 500);
          end({ status_code: statusCode });
          this.counter.inc({ method, route, status_code: statusCode });
        },
      }),
    );
  }
}
