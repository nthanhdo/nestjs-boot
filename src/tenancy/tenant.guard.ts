import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TENANT_REQUIRED_KEY, TENANT_SCOPED_KEY } from './constants';
import { getTenantId } from './tenant-context';

/**
 * @TenantRequired() — marks a route as requiring a valid tenant context.
 *
 * The TenantGuard will reject (401) any request where no tenant ID
 * was resolved (e.g. middleware not applied, or bad header).
 *
 * ```ts
 * @Get()
 * @TenantRequired()
 * findAll() {}
 * ```
 */
export const TenantRequired = () => SetMetadata(TENANT_REQUIRED_KEY, true);

/**
 * @TenantScoped() — signals that queries on this route should be auto-filtered
 * by tenantId. The actual filtering happens in TenantAwareRepository.
 *
 * Primarily informational/documentation at the route level; the repository
 * layer always auto-scopes when a tenant context is active.
 *
 * ```ts
 * @Get()
 * @TenantScoped()
 * findAll() {}
 * ```
 */
export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);

/**
 * @CurrentTenant() — parameter decorator that injects the current tenant ID.
 *
 * ```ts
 * @Get()
 * findAll(@CurrentTenant() tenantId: string) { ... }
 * ```
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Record<string, any>>();
    // Prefer AsyncLocalStorage value; fall back to middleware-set property
    return getTenantId() ?? request.tenantId;
  },
);

/**
 * TenantGuard — enforces tenant presence on routes decorated with @TenantRequired().
 *
 * Register globally via APP_GUARD, or apply per-controller.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(TENANT_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      // Route doesn't require tenant — allow through
      return true;
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'This route requires a valid tenant context (X-Tenant-ID header missing or invalid)',
      );
    }

    return true;
  }
}
