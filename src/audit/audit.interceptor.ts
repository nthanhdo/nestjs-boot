import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_ACTION_KEY } from './decorators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditAction = this.reflector.get<string>(AUDIT_ACTION_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest();
    const ctx = this.auditService.extractRequestContext(request);
    const method = request.method ?? '';
    const url = request.url ?? request.originalUrl ?? '';

    return next.handle().pipe(
      tap(() => {
        if (auditAction) {
          // Log successful response when @Audited() is present
          this.auditService
            .logAccess(ctx.actorId, auditAction, undefined, undefined, {
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
              method,
              url,
            })
            .catch(() => {}); // fire-and-forget
        }
      }),
      catchError((error) => {
        if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
          this.auditService
            .logDenial(ctx.actorId, auditAction ?? `${method} ${url}`, undefined, undefined, {
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
