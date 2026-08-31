import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PermissionStore } from './permission-store';
import { PrivilegeBoundary, LeveledRole } from './privilege-boundary';

export interface RoleDefinitionRecord {
  code: string;
  name: string;
  description?: string;
  level: number;
  isSystem?: boolean;
  permissions: string[];
  inherits?: string[];
}

export interface PermissionDefinitionRecord {
  code: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
}

/**
 * RoleManager — manages roles, permissions, and user-role assignments.
 * Uses PermissionStore for persistence and PrivilegeBoundary for enforcement.
 */
@Injectable()
export class RoleManager {
  private readonly logger = new Logger(RoleManager.name);
  private roles = new Map<string, RoleDefinitionRecord>();
  private permissions = new Map<string, PermissionDefinitionRecord>();
  private rolePermissions = new Map<string, Set<string>>();

  constructor(
    private readonly store: PermissionStore,
    private readonly boundary?: PrivilegeBoundary,
  ) {}

  // ── Role CRUD ──

  createRole(role: RoleDefinitionRecord): RoleDefinitionRecord {
    if (this.roles.has(role.code)) {
      throw new ConflictException(`Role "${role.code}" already exists`);
    }
    this.roles.set(role.code, role);
    this.rolePermissions.set(role.code, new Set(role.permissions));
    if (this.boundary) {
      this.boundary.define({
        name: role.code,
        level: role.level,
        inherits: role.inherits,
        permissions: role.permissions,
      } satisfies LeveledRole);
    }
    return role;
  }

  getRole(code: string): RoleDefinitionRecord {
    const role = this.roles.get(code);
    if (!role) throw new NotFoundException(`Role "${code}" not found`);
    return role;
  }

  listRoles(): RoleDefinitionRecord[] {
    return [...this.roles.values()].sort((a, b) => b.level - a.level);
  }

  updateRole(code: string, data: Partial<RoleDefinitionRecord>): RoleDefinitionRecord {
    const existing = this.getRole(code);
    if (existing.isSystem && data.code && data.code !== code) {
      throw new ConflictException('Cannot rename a system role');
    }
    const updated = { ...existing, ...data, code };
    this.roles.set(code, updated);
    if (data.permissions) {
      this.rolePermissions.set(code, new Set(data.permissions));
    }
    return updated;
  }

  deleteRole(code: string): void {
    const role = this.getRole(code);
    if (role.isSystem) {
      throw new ConflictException('Cannot delete a system role');
    }
    this.roles.delete(code);
    this.rolePermissions.delete(code);
  }

  // ── Permission CRUD ──

  createPermission(perm: PermissionDefinitionRecord): PermissionDefinitionRecord {
    if (this.permissions.has(perm.code)) {
      throw new ConflictException(`Permission "${perm.code}" already exists`);
    }
    this.permissions.set(perm.code, perm);
    return perm;
  }

  getPermission(code: string): PermissionDefinitionRecord {
    const perm = this.permissions.get(code);
    if (!perm) throw new NotFoundException(`Permission "${code}" not found`);
    return perm;
  }

  listPermissions(): PermissionDefinitionRecord[] {
    return [...this.permissions.values()];
  }

  // ── Role-Permission assignment ──

  assignPermissionToRole(roleCode: string, permissionCode: string): void {
    this.getRole(roleCode);
    this.getPermission(permissionCode);
    const perms = this.rolePermissions.get(roleCode) ?? new Set<string>();
    perms.add(permissionCode);
    this.rolePermissions.set(roleCode, perms);
  }

  removePermissionFromRole(roleCode: string, permissionCode: string): void {
    const perms = this.rolePermissions.get(roleCode);
    if (perms) perms.delete(permissionCode);
  }

  getRolePermissions(roleCode: string): string[] {
    this.getRole(roleCode);
    return [...(this.rolePermissions.get(roleCode) ?? [])];
  }

  // ── User-Role assignment (with privilege boundary) ──

  async assignRoleToUser(userId: string, roleCode: string, actorRoles?: string[]): Promise<void> {
    this.getRole(roleCode);
    if (actorRoles && this.boundary) {
      this.boundary.enforceAssignment(actorRoles, roleCode);
    }
    await this.store.assignRoles(userId, [roleCode]);
  }

  async removeRoleFromUser(userId: string, roleCode: string, actorRoles?: string[]): Promise<void> {
    if (actorRoles && this.boundary) {
      // Actor must have higher level than the role being removed
      this.boundary.enforceAssignment(actorRoles, roleCode);
    }
    await this.store.removeRoles(userId, [roleCode]);
  }

  async getUserRoles(userId: string): Promise<string[]> {
    return this.store.getUserRoles(userId);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    return this.store.getUserPermissions(userId);
  }

  // ── Seeding (idempotent) ──

  seed(
    roles: RoleDefinitionRecord[],
    permissions: PermissionDefinitionRecord[],
  ): { rolesCreated: number; permissionsCreated: number } {
    let rolesCreated = 0;
    let permissionsCreated = 0;

    for (const perm of permissions) {
      if (!this.permissions.has(perm.code)) {
        this.permissions.set(perm.code, perm);
        permissionsCreated++;
      }
    }

    for (const role of roles) {
      if (!this.roles.has(role.code)) {
        this.roles.set(role.code, role);
        this.rolePermissions.set(role.code, new Set(role.permissions));
        if (this.boundary) {
          this.boundary.define({
            name: role.code,
            level: role.level,
            inherits: role.inherits,
            permissions: role.permissions,
          } satisfies LeveledRole);
        }
        rolesCreated++;
      }
    }

    return { rolesCreated, permissionsCreated };
  }
}
