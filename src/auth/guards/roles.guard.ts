import { CanActivate, ExecutionContext, Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, ROLES_KEY, IS_PUBLIC_KEY } from '../constants';
import { AuthOptions } from '../interfaces';

/**
 * RolesGuard — checks if user has ANY of the required roles.
 * If no @Roles() decorator on the route, passes through (no restriction).
 * Respects @Public() decorator.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly authOptions: AuthOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No @Roles() decorator → no restriction
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const extractRoles = this.authOptions.rbac?.extractRoles
      ?? ((req: any) => req.user?.roles ?? []);
    const userRoles: string[] = extractRoles(request);

    // User must have ANY of the required roles
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
