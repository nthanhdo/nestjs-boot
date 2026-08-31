import { describe, it, expect } from 'vitest';
import { RoleHierarchy } from '../../src/auth/rbac/role-hierarchy';

describe('RoleHierarchy', () => {
  describe('basic resolution', () => {
    it('resolves a single role with no inheritance', () => {
      const h = new RoleHierarchy([{ name: 'user' }]);
      expect(h.resolve('user')).toEqual(['user']);
    });

    it('includes the role itself in resolved list', () => {
      const h = new RoleHierarchy([
        { name: 'admin', inherits: ['user'] },
        { name: 'user' },
      ]);
      const resolved = h.resolve('admin');
      expect(resolved).toContain('admin');
      expect(resolved).toContain('user');
    });

    it('resolves multiple levels of inheritance', () => {
      const h = new RoleHierarchy([
        { name: 'superadmin', inherits: ['admin'] },
        { name: 'admin', inherits: ['user'] },
        { name: 'user' },
      ]);
      const resolved = h.resolve('superadmin');
      expect(resolved).toContain('superadmin');
      expect(resolved).toContain('admin');
      expect(resolved).toContain('user');
    });

    it('resolveAll merges resolved roles across multiple input roles', () => {
      const h = new RoleHierarchy([
        { name: 'admin', inherits: ['user'] },
        { name: 'editor', inherits: ['user'] },
        { name: 'user' },
      ]);
      const resolved = h.resolveAll(['admin', 'editor']);
      expect(resolved).toContain('admin');
      expect(resolved).toContain('editor');
      expect(resolved).toContain('user');
      // 'user' should appear only once (Set dedup)
      expect(resolved.filter((r) => r === 'user').length).toBe(1);
    });

    it('handles an unknown role gracefully (not in registry)', () => {
      const h = new RoleHierarchy([{ name: 'user' }]);
      expect(h.resolve('ghost')).toEqual(['ghost']);
    });
  });

  describe('define (dynamic registration)', () => {
    it('registers a new role at runtime', () => {
      const h = new RoleHierarchy();
      h.define({ name: 'mod', inherits: ['user'] });
      h.define({ name: 'user' });
      const resolved = h.resolve('mod');
      expect(resolved).toContain('mod');
      expect(resolved).toContain('user');
    });

    it('overwrites an existing definition', () => {
      const h = new RoleHierarchy([{ name: 'admin' }]);
      h.define({ name: 'admin', inherits: ['user'] });
      h.define({ name: 'user' });
      expect(h.resolve('admin')).toContain('user');
    });
  });

  describe('permission resolution', () => {
    it('returns direct permissions for a role', () => {
      const h = new RoleHierarchy([
        { name: 'user', permissions: ['post:read', 'comment:read'] },
      ]);
      expect(h.getPermissions('user')).toEqual(
        expect.arrayContaining(['post:read', 'comment:read']),
      );
    });

    it('inherits permissions from parent roles', () => {
      const h = new RoleHierarchy([
        { name: 'admin', inherits: ['user'], permissions: ['user:delete'] },
        { name: 'user', permissions: ['post:read'] },
      ]);
      const perms = h.getPermissions('admin');
      expect(perms).toContain('post:read');
      expect(perms).toContain('user:delete');
    });

    it('getAllPermissions merges across multiple roles without duplicates', () => {
      const h = new RoleHierarchy([
        { name: 'admin', permissions: ['admin:panel'] },
        { name: 'editor', permissions: ['post:write'] },
        { name: 'user', permissions: ['post:read'] },
      ]);
      const perms = h.getAllPermissions(['admin', 'editor']);
      expect(perms).toContain('admin:panel');
      expect(perms).toContain('post:write');
      expect(perms).not.toContain('post:read'); // not inherited here
    });

    it('resolves permissions through multi-level inheritance', () => {
      const h = new RoleHierarchy([
        { name: 'superadmin', inherits: ['admin'], permissions: ['system:config'] },
        { name: 'admin', inherits: ['user'], permissions: ['user:manage'] },
        { name: 'user', permissions: ['post:read'] },
      ]);
      const perms = h.getPermissions('superadmin');
      expect(perms).toContain('system:config');
      expect(perms).toContain('user:manage');
      expect(perms).toContain('post:read');
    });
  });

  describe('circular dependency detection', () => {
    it('reports no cycles for a valid hierarchy', () => {
      const h = new RoleHierarchy([
        { name: 'admin', inherits: ['user'] },
        { name: 'user' },
      ]);
      const result = h.validate();
      expect(result.valid).toBe(true);
      expect(result.cycles).toHaveLength(0);
    });

    it('detects a direct self-reference cycle', () => {
      const h = new RoleHierarchy([{ name: 'admin', inherits: ['admin'] }]);
      const result = h.validate();
      expect(result.valid).toBe(false);
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('detects an indirect cycle (A→B→A)', () => {
      const h = new RoleHierarchy([
        { name: 'a', inherits: ['b'] },
        { name: 'b', inherits: ['a'] },
      ]);
      const result = h.validate();
      expect(result.valid).toBe(false);
    });

    it('resolve() does not loop infinitely on cycles (cycle guard)', () => {
      const h = new RoleHierarchy([
        { name: 'a', inherits: ['b'] },
        { name: 'b', inherits: ['a'] },
      ]);
      // Should return without hanging
      expect(() => h.resolve('a')).not.toThrow();
    });
  });

  describe('empty hierarchy (backward compat)', () => {
    it('creates with no definitions', () => {
      const h = new RoleHierarchy();
      expect(h.resolve('admin')).toEqual(['admin']);
      expect(h.getPermissions('admin')).toEqual([]);
      expect(h.validate()).toEqual({ valid: true, cycles: [] });
    });
  });
});
