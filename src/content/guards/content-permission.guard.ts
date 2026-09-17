import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const CONTENT_PERMISSIONS_KEY = 'content_permissions';

/**
 * Decorator to set required content permissions on a route.
 * Example: @ContentPermissions('content:entry:publish')
 */
export const ContentPermissions = (...permissions: string[]) =>
  (target: any, _propertyKey?: string, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(CONTENT_PERMISSIONS_KEY, permissions, descriptor?.value ?? target);
  };

@Injectable()
export class ContentPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(CONTENT_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Authentication required');

    // Check if user has super admin role
    if (user.roles?.includes('super_admin')) return true;

    // Check content-specific permissions
    const userPermissions: string[] = user.permissions ?? [];
    const hasAll = required.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      throw new ForbiddenException(`Missing permissions: ${required.filter((p) => !userPermissions.includes(p)).join(', ')}`);
    }

    return true;
  }
}
