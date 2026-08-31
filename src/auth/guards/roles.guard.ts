import { CanActivate, ExecutionContext, Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, ROLES_KEY, IS_PUBLIC_KEY } from '../constants';
import { AuthOptions } from '../interfaces';
import { RoleHierarchy } from '../rbac/role-hierarchy';
import { SUPERADMIN_ONLY_KEY } from '../rbac/superadmin.decorator';

/**
 * RolesGuard — checks if user has ANY of the required roles.
 * If no @Roles() decorator on the route, passes through (no restriction).
 * Respects @Public() decorator.
 *
 * Supports:
 * - `rbac.superAdmin`: users with this role always pass.
 * - `rbac.hierarchy`: role inheritance is resolved before checking.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private static _instances = new Set<RolesGuard>();
  private _hierarchy: RoleHierarchy | null = null;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly authOptions: AuthOptions,
  ) {
    RolesGuard._instances.add(this);
  }

  /** Clear cached RoleHierarchy on all guard instances (call after role mutations) */
  static clearHierarchyCache(): void {
    for (const inst of RolesGuard._instances) {
      inst._hierarchy = null;
    }
  }

  private getHierarchy(): RoleHierarchy | null {
    const defs = this.authOptions.rbac?.hierarchy;
    if (!defs) return null;
    if (!this._hierarchy) {
      this._hierarchy = new RoleHierarchy(defs);
    }
    return this._hierarchy;
  }

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
    // No @Roles() decorator — deny-by-default or pass through
    if (!requiredRoles || requiredRoles.length === 0) {
      if (this.authOptions.rbac?.denyByDefault) {
        throw new ForbiddenException('Access denied: no roles defined for this route');
      }
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const extractRoles = this.authOptions.rbac?.extractRoles
      ?? ((req: any) => req.user?.roles ?? []);
    const rawUserRoles: string[] = extractRoles(request);

    // Super-admin bypass
    const superAdmin = this.authOptions.rbac?.superAdmin;
    if (superAdmin && rawUserRoles.includes(superAdmin)) return true;

    // @SuperAdminOnly() — only superAdmin role is allowed, reject all others
    const isSuperAdminOnly = this.reflector.getAllAndOverride<boolean>(SUPERADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isSuperAdminOnly) {
      throw new ForbiddenException('Super-admin access only');
    }

    // Resolve through hierarchy (lazy, cached)
    const hierarchy = this.getHierarchy();
    const userRoles = hierarchy ? hierarchy.resolveAll(rawUserRoles) : rawUserRoles;

    // User must have ANY of the required roles
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
