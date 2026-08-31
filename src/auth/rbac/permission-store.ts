import { RoleHierarchy, matchesPermission } from './role-hierarchy';

export interface PermissionStore {
  /** Get permissions for a user by ID */
  getUserPermissions(userId: string): Promise<string[]>;
  /** Get roles for a user by ID */
  getUserRoles(userId: string): Promise<string[]>;
  /** Assign roles to a user */
  assignRoles(userId: string, roles: string[]): Promise<void>;
  /** Remove roles from a user */
  removeRoles(userId: string, roles: string[]): Promise<void>;
  /** Assign permissions directly to a user */
  assignPermissions(userId: string, permissions: string[]): Promise<void>;
  /** Remove permissions from a user */
  removePermissions(userId: string, permissions: string[]): Promise<void>;
  /** Check if a user has a specific permission (direct or via role hierarchy) */
  hasPermission(userId: string, permission: string, hierarchy?: RoleHierarchy): Promise<boolean>;
}

export const PERMISSION_STORE = 'BOOT_PERMISSION_STORE';

/**
 * In-memory store for development/testing. NOT for production.
 * Use MongoPermissionStore or RedisPermissionStore for production.
 */
export class MemoryPermissionStore implements PermissionStore {
  private userRoles = new Map<string, Set<string>>();
  private userPermissions = new Map<string, Set<string>>();

  async getUserPermissions(userId: string): Promise<string[]> {
    return [...(this.userPermissions.get(userId) ?? [])];
  }

  async getUserRoles(userId: string): Promise<string[]> {
    return [...(this.userRoles.get(userId) ?? [])];
  }

  async assignRoles(userId: string, roles: string[]): Promise<void> {
    if (!this.userRoles.has(userId)) this.userRoles.set(userId, new Set());
    for (const r of roles) this.userRoles.get(userId)!.add(r);
  }

  async removeRoles(userId: string, roles: string[]): Promise<void> {
    const set = this.userRoles.get(userId);
    if (set) for (const r of roles) set.delete(r);
  }

  async assignPermissions(userId: string, permissions: string[]): Promise<void> {
    if (!this.userPermissions.has(userId)) this.userPermissions.set(userId, new Set());
    for (const p of permissions) this.userPermissions.get(userId)!.add(p);
  }

  async removePermissions(userId: string, permissions: string[]): Promise<void> {
    const set = this.userPermissions.get(userId);
    if (set) for (const p of permissions) set.delete(p);
  }

  async hasPermission(userId: string, permission: string, hierarchy?: RoleHierarchy): Promise<boolean> {
    // Check direct user permissions (with wildcard support)
    const directPerms = this.userPermissions.get(userId);
    if (directPerms) {
      for (const userPerm of directPerms) {
        if (matchesPermission(userPerm, permission)) return true;
      }
    }

    // Resolve role-based permissions via hierarchy
    if (hierarchy) {
      const roles = await this.getUserRoles(userId);
      if (roles.length > 0) {
        const rolePerms = hierarchy.getAllPermissions(roles);
        for (const rolePerm of rolePerms) {
          if (matchesPermission(rolePerm, permission)) return true;
        }
      }
    }

    return false;
  }
}
