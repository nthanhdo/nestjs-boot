import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MemoryPermissionStore } from '../../src/auth/rbac/permission-store';
import { PrivilegeBoundary } from '../../src/auth/rbac/privilege-boundary';
import { RoleManager, RoleDefinitionRecord, PermissionDefinitionRecord } from '../../src/auth/rbac/role-manager.service';

// ── Fixtures ──

const adminRole: RoleDefinitionRecord = {
  code: 'admin',
  name: 'Administrator',
  level: 50,
  permissions: ['user:read', 'user:write'],
};

const userRole: RoleDefinitionRecord = {
  code: 'user',
  name: 'Regular User',
  level: 10,
  permissions: ['post:read'],
};

const systemRole: RoleDefinitionRecord = {
  code: 'superadmin',
  name: 'Super Administrator',
  level: 100,
  isSystem: true,
  permissions: [],
};

const readPerm: PermissionDefinitionRecord = {
  code: 'user:read',
  name: 'Read Users',
  resource: 'user',
  action: 'read',
};

const writePerm: PermissionDefinitionRecord = {
  code: 'user:write',
  name: 'Write Users',
  resource: 'user',
  action: 'write',
};

// ── Helpers ──

function makeManager(withBoundary = false): RoleManager {
  const store = new MemoryPermissionStore();
  const boundary = withBoundary
    ? new PrivilegeBoundary([
        { name: 'superadmin', level: 100 },
        { name: 'admin', level: 50 },
        { name: 'user', level: 10 },
      ])
    : undefined;
  return new RoleManager(store, boundary);
}

// ── Tests ──

describe('RoleManager', () => {
  let manager: RoleManager;

  beforeEach(() => {
    manager = makeManager();
  });

  // ── Role CRUD ──

  describe('createRole', () => {
    it('creates and returns a new role', () => {
      const result = manager.createRole(adminRole);
      expect(result).toEqual(adminRole);
    });

    it('throws ConflictException when role already exists', () => {
      manager.createRole(adminRole);
      expect(() => manager.createRole(adminRole)).toThrow(ConflictException);
    });
  });

  describe('getRole', () => {
    it('returns the role by code', () => {
      manager.createRole(adminRole);
      expect(manager.getRole('admin')).toEqual(adminRole);
    });

    it('throws NotFoundException for a missing role', () => {
      expect(() => manager.getRole('ghost')).toThrow(NotFoundException);
    });
  });

  describe('listRoles', () => {
    it('returns all roles sorted by level descending', () => {
      manager.createRole(userRole);
      manager.createRole(adminRole);
      const list = manager.listRoles();
      expect(list).toHaveLength(2);
      expect(list[0].code).toBe('admin');   // level 50
      expect(list[1].code).toBe('user');    // level 10
    });

    it('returns empty array when no roles exist', () => {
      expect(manager.listRoles()).toEqual([]);
    });
  });

  describe('updateRole', () => {
    it('updates mutable fields of an existing role', () => {
      manager.createRole(adminRole);
      const updated = manager.updateRole('admin', { name: 'New Admin Name' });
      expect(updated.name).toBe('New Admin Name');
      expect(updated.code).toBe('admin');
    });

    it('updates rolePermissions when permissions are changed', () => {
      manager.createRole(adminRole);
      manager.createPermission(readPerm);
      manager.updateRole('admin', { permissions: ['user:read'] });
      expect(manager.getRolePermissions('admin')).toEqual(['user:read']);
    });

    it('throws NotFoundException when updating a non-existent role', () => {
      expect(() => manager.updateRole('ghost', { name: 'X' })).toThrow(NotFoundException);
    });

    it('throws ConflictException when trying to rename a system role', () => {
      manager.createRole(systemRole);
      expect(() => manager.updateRole('superadmin', { code: 'superadmin_renamed' })).toThrow(
        ConflictException,
      );
    });
  });

  describe('deleteRole', () => {
    it('deletes a non-system role', () => {
      manager.createRole(adminRole);
      manager.deleteRole('admin');
      expect(() => manager.getRole('admin')).toThrow(NotFoundException);
    });

    it('throws ConflictException when deleting a system role', () => {
      manager.createRole(systemRole);
      expect(() => manager.deleteRole('superadmin')).toThrow(ConflictException);
    });

    it('throws NotFoundException for a missing role', () => {
      expect(() => manager.deleteRole('ghost')).toThrow(NotFoundException);
    });
  });

  // ── Permission CRUD ──

  describe('createPermission', () => {
    it('creates and returns a new permission', () => {
      const result = manager.createPermission(readPerm);
      expect(result).toEqual(readPerm);
    });

    it('throws ConflictException when permission already exists', () => {
      manager.createPermission(readPerm);
      expect(() => manager.createPermission(readPerm)).toThrow(ConflictException);
    });
  });

  describe('getPermission', () => {
    it('returns the permission by code', () => {
      manager.createPermission(readPerm);
      expect(manager.getPermission('user:read')).toEqual(readPerm);
    });

    it('throws NotFoundException for a missing permission', () => {
      expect(() => manager.getPermission('ghost:action')).toThrow(NotFoundException);
    });
  });

  describe('listPermissions', () => {
    it('returns all permissions', () => {
      manager.createPermission(readPerm);
      manager.createPermission(writePerm);
      expect(manager.listPermissions()).toHaveLength(2);
    });

    it('returns empty array when no permissions exist', () => {
      expect(manager.listPermissions()).toEqual([]);
    });
  });

  // ── Role-Permission assignment ──

  describe('assignPermissionToRole', () => {
    it('assigns a permission to a role', () => {
      manager.createRole(userRole);
      manager.createPermission(writePerm);
      manager.assignPermissionToRole('user', 'user:write');
      expect(manager.getRolePermissions('user')).toContain('user:write');
    });

    it('throws NotFoundException when role does not exist', () => {
      manager.createPermission(readPerm);
      expect(() => manager.assignPermissionToRole('ghost', 'user:read')).toThrow(NotFoundException);
    });

    it('throws NotFoundException when permission does not exist', () => {
      manager.createRole(userRole);
      expect(() => manager.assignPermissionToRole('user', 'ghost:action')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('removePermissionFromRole', () => {
    it('removes an existing permission from a role', () => {
      manager.createRole(adminRole);
      manager.createPermission(readPerm);
      manager.assignPermissionToRole('admin', 'user:read');
      manager.removePermissionFromRole('admin', 'user:read');
      expect(manager.getRolePermissions('admin')).not.toContain('user:read');
    });

    it('is a no-op when permission was not assigned', () => {
      manager.createRole(userRole);
      expect(() => manager.removePermissionFromRole('user', 'ghost:action')).not.toThrow();
    });
  });

  describe('getRolePermissions', () => {
    it('returns permissions set at role creation', () => {
      manager.createRole(adminRole);
      // adminRole has ['user:read', 'user:write'] in its permissions array
      expect(manager.getRolePermissions('admin')).toEqual(
        expect.arrayContaining(['user:read', 'user:write']),
      );
    });

    it('throws NotFoundException for a missing role', () => {
      expect(() => manager.getRolePermissions('ghost')).toThrow(NotFoundException);
    });
  });

  // ── User-Role assignment ──

  describe('assignRoleToUser', () => {
    it('assigns a role to a user via the store', async () => {
      manager.createRole(userRole);
      await manager.assignRoleToUser('user-1', 'user');
      const roles = await manager.getUserRoles('user-1');
      expect(roles).toContain('user');
    });

    it('throws NotFoundException when the role does not exist', async () => {
      await expect(manager.assignRoleToUser('user-1', 'ghost')).rejects.toThrow(NotFoundException);
    });

    it('enforces privilege boundary when actorRoles provided', async () => {
      const m = makeManager(true);
      m.createRole(adminRole);
      m.createRole(userRole);
      // admin(50) can assign user(10)
      await expect(m.assignRoleToUser('u1', 'user', ['admin'])).resolves.not.toThrow();
      // user(10) cannot assign admin(50)
      await expect(m.assignRoleToUser('u2', 'admin', ['user'])).rejects.toThrow(ForbiddenException);
    });

    it('skips boundary check when no actorRoles provided', async () => {
      manager.createRole(userRole);
      await expect(manager.assignRoleToUser('u1', 'user')).resolves.not.toThrow();
    });
  });

  describe('removeRoleFromUser', () => {
    it('removes a role from a user via the store', async () => {
      manager.createRole(userRole);
      await manager.assignRoleToUser('user-1', 'user');
      await manager.removeRoleFromUser('user-1', 'user');
      const roles = await manager.getUserRoles('user-1');
      expect(roles).not.toContain('user');
    });

    it('enforces privilege boundary when actorRoles provided', async () => {
      const m = makeManager(true);
      m.createRole(userRole);
      m.createRole(adminRole);
      // user(10) cannot remove admin(50)
      await expect(m.removeRoleFromUser('u1', 'admin', ['user'])).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getUserRoles / getUserPermissions', () => {
    it('getUserRoles delegates to the store', async () => {
      manager.createRole(userRole);
      await manager.assignRoleToUser('u1', 'user');
      expect(await manager.getUserRoles('u1')).toContain('user');
    });

    it('getUserPermissions delegates to the store', async () => {
      const store = new MemoryPermissionStore();
      await store.assignPermissions('u1', ['post:read']);
      const m = new RoleManager(store);
      expect(await m.getUserPermissions('u1')).toContain('post:read');
    });

    it('returns empty arrays for unknown user', async () => {
      expect(await manager.getUserRoles('nobody')).toEqual([]);
      expect(await manager.getUserPermissions('nobody')).toEqual([]);
    });
  });

  // ── Seeding ──

  describe('seed', () => {
    const seedRoles: RoleDefinitionRecord[] = [adminRole, userRole];
    const seedPerms: PermissionDefinitionRecord[] = [readPerm, writePerm];

    it('creates all roles and permissions on first run', () => {
      const result = manager.seed(seedRoles, seedPerms);
      expect(result.rolesCreated).toBe(2);
      expect(result.permissionsCreated).toBe(2);
    });

    it('is idempotent — running twice creates nothing on second run', () => {
      manager.seed(seedRoles, seedPerms);
      const result = manager.seed(seedRoles, seedPerms);
      expect(result.rolesCreated).toBe(0);
      expect(result.permissionsCreated).toBe(0);
    });

    it('does not overwrite existing roles on second run', () => {
      manager.seed(seedRoles, seedPerms);
      manager.updateRole('admin', { name: 'Modified Admin' });
      manager.seed(seedRoles, seedPerms); // should not revert
      expect(manager.getRole('admin').name).toBe('Modified Admin');
    });

    it('seeds roles into privilege boundary when boundary is provided', () => {
      const m = makeManager(true);
      m.seed([adminRole, userRole], []);
      // boundary should know admin level
      const roles = m.listRoles();
      expect(roles.map((r) => r.code)).toContain('admin');
    });

    it('handles empty arrays gracefully', () => {
      const result = manager.seed([], []);
      expect(result.rolesCreated).toBe(0);
      expect(result.permissionsCreated).toBe(0);
    });
  });
});
