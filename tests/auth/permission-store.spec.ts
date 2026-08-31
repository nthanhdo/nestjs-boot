import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryPermissionStore } from '../../src/auth/rbac/permission-store';

describe('MemoryPermissionStore', () => {
  let store: MemoryPermissionStore;

  beforeEach(() => {
    store = new MemoryPermissionStore();
  });

  describe('roles', () => {
    it('returns empty roles for unknown user', async () => {
      expect(await store.getUserRoles('u1')).toEqual([]);
    });

    it('assigns roles to a user', async () => {
      await store.assignRoles('u1', ['admin', 'editor']);
      const roles = await store.getUserRoles('u1');
      expect(roles).toContain('admin');
      expect(roles).toContain('editor');
    });

    it('accumulates roles across multiple assignRoles calls', async () => {
      await store.assignRoles('u1', ['admin']);
      await store.assignRoles('u1', ['editor']);
      const roles = await store.getUserRoles('u1');
      expect(roles).toContain('admin');
      expect(roles).toContain('editor');
    });

    it('does not duplicate roles', async () => {
      await store.assignRoles('u1', ['admin']);
      await store.assignRoles('u1', ['admin']);
      const roles = await store.getUserRoles('u1');
      expect(roles.filter((r) => r === 'admin').length).toBe(1);
    });

    it('removes roles from a user', async () => {
      await store.assignRoles('u1', ['admin', 'editor']);
      await store.removeRoles('u1', ['admin']);
      const roles = await store.getUserRoles('u1');
      expect(roles).not.toContain('admin');
      expect(roles).toContain('editor');
    });

    it('removeRoles on unknown user does not throw', async () => {
      await expect(store.removeRoles('ghost', ['admin'])).resolves.toBeUndefined();
    });

    it('isolates roles between different users', async () => {
      await store.assignRoles('u1', ['admin']);
      await store.assignRoles('u2', ['user']);
      expect(await store.getUserRoles('u1')).toContain('admin');
      expect(await store.getUserRoles('u2')).not.toContain('admin');
    });
  });

  describe('permissions', () => {
    it('returns empty permissions for unknown user', async () => {
      expect(await store.getUserPermissions('u1')).toEqual([]);
    });

    it('assigns permissions to a user', async () => {
      await store.assignPermissions('u1', ['post:read', 'post:write']);
      const perms = await store.getUserPermissions('u1');
      expect(perms).toContain('post:read');
      expect(perms).toContain('post:write');
    });

    it('accumulates permissions across multiple calls', async () => {
      await store.assignPermissions('u1', ['post:read']);
      await store.assignPermissions('u1', ['post:write']);
      const perms = await store.getUserPermissions('u1');
      expect(perms).toContain('post:read');
      expect(perms).toContain('post:write');
    });

    it('does not duplicate permissions', async () => {
      await store.assignPermissions('u1', ['post:read']);
      await store.assignPermissions('u1', ['post:read']);
      const perms = await store.getUserPermissions('u1');
      expect(perms.filter((p) => p === 'post:read').length).toBe(1);
    });

    it('removes permissions from a user', async () => {
      await store.assignPermissions('u1', ['post:read', 'post:write']);
      await store.removePermissions('u1', ['post:write']);
      const perms = await store.getUserPermissions('u1');
      expect(perms).toContain('post:read');
      expect(perms).not.toContain('post:write');
    });

    it('removePermissions on unknown user does not throw', async () => {
      await expect(store.removePermissions('ghost', ['post:read'])).resolves.toBeUndefined();
    });

    it('isolates permissions between different users', async () => {
      await store.assignPermissions('u1', ['admin:panel']);
      expect(await store.getUserPermissions('u2')).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    it('returns true when user has the permission', async () => {
      await store.assignPermissions('u1', ['post:read']);
      expect(await store.hasPermission('u1', 'post:read')).toBe(true);
    });

    it('returns false when user does not have the permission', async () => {
      await store.assignPermissions('u1', ['post:read']);
      expect(await store.hasPermission('u1', 'post:write')).toBe(false);
    });

    it('returns false for unknown user', async () => {
      expect(await store.hasPermission('ghost', 'post:read')).toBe(false);
    });

    it('returns false after permission is removed', async () => {
      await store.assignPermissions('u1', ['post:read']);
      await store.removePermissions('u1', ['post:read']);
      expect(await store.hasPermission('u1', 'post:read')).toBe(false);
    });
  });
});
