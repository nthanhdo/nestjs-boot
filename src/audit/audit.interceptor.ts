import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
          const request = context.switchToHttp().getRequest();
          const ctx = this.auditService.extractRequestContext(request);
          const method = request.method ?? '';
          const url = request.url ?? request.originalUrl ?? '';
          this.auditService
            .logDenial(ctx.actorId, `${method} ${url}`, undefined, undefined, {
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
              error: error.message,
            })
            .catch(() => {}); // fire-and-forget
        }
        return throwError(() => error);
      }),
    );
  }
}
