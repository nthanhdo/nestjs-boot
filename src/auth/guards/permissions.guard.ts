import { CanActivate, ExecutionContext, Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, PERMISSIONS_KEY, IS_PUBLIC_KEY } from '../constants';
import { AuthOptions } from '../interfaces';
import { RoleHierarchy, matchesPermission } from '../rbac/role-hierarchy';

/**
 * PermissionsGuard — checks if user has ALL required permissions.
 * If no @Permissions() decorator on the route, passes through (no restriction).
 * Respects @Public() decorator.
 *
 * Supports:
 * - `rbac.superAdmin`: users with this role always pass.
 * - `rbac.permissionStore`: permissions loaded from DB store (async path).
 * - `rbac.hierarchy`: role-based permissions resolved from hierarchy and merged.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private static _instances = new Set<PermissionsGuard>();
  private _hierarchy: RoleHierarchy | null = null;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly authOptions: AuthOptions,
  ) {
    PermissionsGuard._instances.add(this);
  }

  /** Clear cached RoleHierarchy on all guard instances (call after role mutations) */
  static clearHierarchyCache(): void {
    for (const inst of PermissionsGuard._instances) {
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

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No @Permissions() decorator — deny-by-default or pass through
    if (!requiredPermissions || requiredPermissions.length === 0) {
      if (this.authOptions.rbac?.denyByDefault) {
        throw new ForbiddenException('Access denied: no permissions defined for this route');
      }
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // If permissionStore configured, run async path
    if (this.authOptions.rbac?.permissionStore) {
      return this._canActivateAsync(context, request, requiredPermissions);
    }

    return this._canActivateSync(request, requiredPermissions);
  }

  private _canActivateSync(request: any, requiredPermissions: string[]): boolean {
    const extractRoles = this.authOptions.rbac?.extractRoles
      ?? ((req: any) => req.user?.roles ?? []);
    const extractPermissions = this.authOptions.rbac?.extractPermissions
      ?? ((req: any) => req.user?.permissions ?? []);

    const rawUserRoles: string[] = extractRoles(request);

    // Super-admin bypass
    const superAdmin = this.authOptions.rbac?.superAdmin;
    if (superAdmin && rawUserRoles.includes(superAdmin)) return true;

    // Direct permissions from JWT/request
    const directPermissions: string[] = extractPermissions(request);

    // Role-based permissions from hierarchy
    const hierarchy = this.getHierarchy();
    const hierarchyPermissions = hierarchy ? hierarchy.getAllPermissions(rawUserRoles) : [];

    const userPermissions = new Set([...directPermissions, ...hierarchyPermissions]);

    // User must have ALL required permissions (with wildcard support)
    const userPermsArray = [...userPermissions];
    const hasAll = requiredPermissions.every((required) =>
      userPermsArray.some((userPerm) => matchesPermission(userPerm, required)),
    );
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }

  private async _canActivateAsync(
    _context: ExecutionContext,
    request: any,
    requiredPermissions: string[],
  ): Promise<boolean> {
    const store = this.authOptions.rbac!.permissionStore!;
    const extractRoles = this.authOptions.rbac?.extractRoles
      ?? ((req: any) => req.user?.roles ?? []);
    const extractPermissions = this.authOptions.rbac?.extractPermissions
      ?? ((req: any) => req.user?.permissions ?? []);

    const rawUserRoles: string[] = extractRoles(request);

    // Super-admin bypass
    const superAdmin = this.authOptions.rbac?.superAdmin;
    if (superAdmin && rawUserRoles.includes(superAdmin)) return true;

    // Get userId from request user
    const userId: string | undefined = request.user?.id ?? request.user?.sub;

    // Direct permissions from JWT/request (fallback when no userId)
    const directPermissions: string[] = extractPermissions(request);

    // Store-backed permissions (if userId available)
    const storePermissions: string[] = userId ? await store.getUserPermissions(userId) : [];

    // Role-based permissions from hierarchy
    const hierarchy = this.getHierarchy();
    const hierarchyPermissions = hierarchy ? hierarchy.getAllPermissions(rawUserRoles) : [];

    // Store-backed roles → hierarchy expansion
    const storeRoles: string[] = userId ? await store.getUserRoles(userId) : [];
    const storeRolePermissions = hierarchy ? hierarchy.getAllPermissions(storeRoles) : [];

    const userPermissions = new Set([
      ...directPermissions,
      ...storePermissions,
      ...hierarchyPermissions,
      ...storeRolePermissions,
    ]);

    // Wildcard support
    const userPermsArray = [...userPermissions];
    const hasAll = requiredPermissions.every((required) =>
      userPermsArray.some((userPerm) => matchesPermission(userPerm, required)),
    );
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
