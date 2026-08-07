import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
  LoggerService,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getCorrelationId } from '../correlation/correlation.storage';
import { BootLogger } from './boot-logger';

const BOOT_LOGGER_TOKEN = 'BOOT_LOGGER';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: LoggerService;

  constructor(
    @Optional() @Inject(BOOT_LOGGER_TOKEN) bootLogger?: BootLogger,
  ) {
    this.logger = bootLogger ?? new Logger('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const userAgent = req.get('user-agent') ?? '';
    const correlationId = getCorrelationId();
    const start = Date.now();

    this.logger.log(
      `→ ${method} ${url} [${correlationId ?? '-'}] ua="${userAgent}"`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const duration = Date.now() - start;
          this.logger.log(
            `← ${method} ${url} ${res.statusCode} ${duration}ms [${correlationId ?? '-'}]`,
          );
        },
        error: (err: any) => {
          const duration = Date.now() - start;
          const status = err.status ?? err.statusCode ?? 500;
          this.logger.error(
            `← ${method} ${url} ${status} ${duration}ms [${correlationId ?? '-'}] ${err.message}`,
          );
        },
      }),
    );
  }
}
