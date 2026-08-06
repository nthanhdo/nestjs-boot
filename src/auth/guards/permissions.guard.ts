import { CanActivate, ExecutionContext, Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, PERMISSIONS_KEY, IS_PUBLIC_KEY } from '../constants';
import { AuthOptions } from '../interfaces';

/**
 * PermissionsGuard — checks if user has ALL required permissions.
 * If no @Permissions() decorator on the route, passes through (no restriction).
 * Respects @Public() decorator.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
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

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No @Permissions() decorator → no restriction
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const extractPermissions = this.authOptions.rbac?.extractPermissions
      ?? ((req: any) => req.user?.permissions ?? []);
    const userPermissions: string[] = extractPermissions(request);

    // User must have ALL required permissions
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
