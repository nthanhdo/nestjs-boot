import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BREAK_GLASS_KEY } from './break-glass.decorator';
import { AuditService } from '../../audit/audit.service';
import { SecurityEventType } from '../../audit/interfaces';
import { AUDIT_STORE } from '../../audit/constants';

/**
 * BreakGlassGuard — when a route is marked @BreakGlass(), checks if the user
 * has BREAK_GLASS permission and provided a reason header.
 * If both conditions met, allows access and logs at CRITICAL severity.
 *
 * This guard should run BEFORE scope/policy guards so it can short-circuit them.
 * If the route is not marked @BreakGlass(), this guard passes through.
 */
@Injectable()
export class BreakGlassGuard implements CanActivate {
  private readonly logger = new Logger(BreakGlassGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(AUDIT_STORE) private readonly auditService?: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isBreakGlass = this.reflector.getAllAndOverride<boolean>(BREAK_GLASS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isBreakGlass) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const reason = request.headers?.['x-break-glass-reason'];

    if (!user) return true; // Let auth guard handle missing user

    const permissions: string[] = user.permissions ?? [];
    const hasBreakGlass = permissions.includes('BREAK_GLASS');

    if (!hasBreakGlass || !reason) return true; // Fall through to normal guards

    // Break-glass activated — log at CRITICAL and allow
    const logEntry = {
      type: SecurityEventType.BREAK_GLASS_ACCESS,
      severity: 'CRITICAL' as const,
      actorId: user.sub ?? user.id ?? 'unknown',
      description: `Break-glass access: ${request.method} ${request.url} — reason: ${reason}`,
      ipAddress: request.ip ?? request.connection?.remoteAddress,
      userAgent: request.headers?.['user-agent'],
      metadata: { reason, method: request.method, url: request.url },
    };

    this.logger.warn(
      `BREAK-GLASS ACCESS by ${logEntry.actorId}: ${request.method} ${request.url} — reason: "${reason}"`,
    );

    if (this.auditService && typeof (this.auditService as any).logSecurityEvent === 'function') {
      await (this.auditService as any).logSecurityEvent(logEntry).catch(() => {});
    }

    // Mark request so downstream scope/policy guards can skip
    request._breakGlassActivated = true;

    return true;
  }
}
