import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PrivilegeBoundary, LeveledRole } from '../../src/auth/rbac/privilege-boundary';

const LEVELS: LeveledRole[] = [
  { name: 'superadmin', level: 100 },
  { name: 'admin', level: 50 },
  { name: 'moderator', level: 20 },
  { name: 'user', level: 10 },
];

describe('PrivilegeBoundary', () => {
  let boundary: PrivilegeBoundary;

  beforeEach(() => {
    boundary = new PrivilegeBoundary(LEVELS);
  });

  describe('constructor & define', () => {
    it('initialises with provided definitions', () => {
      expect(boundary.getLevel('admin')).toBe(50);
    });

    it('creates empty boundary when no definitions provided', () => {
      const b = new PrivilegeBoundary();
      expect(b.getLevel('admin')).toBe(0);
    });

    it('define() registers a new role at runtime', () => {
      const b = new PrivilegeBoundary();
      b.define({ name: 'owner', level: 200 });
      expect(b.getLevel('owner')).toBe(200);
    });

    it('define() overwrites an existing role level', () => {
      boundary.define({ name: 'admin', level: 75 });
      expect(boundary.getLevel('admin')).toBe(75);
    });
  });

  describe('getLevel', () => {
    it('returns the configured level for a known role', () => {
      expect(boundary.getLevel('superadmin')).toBe(100);
      expect(boundary.getLevel('user')).toBe(10);
    });

    it('returns 0 for an unknown role', () => {
      expect(boundary.getLevel('ghost')).toBe(0);
    });
  });

  describe('getMaxLevel', () => {
    it('returns the highest level among multiple roles', () => {
      expect(boundary.getMaxLevel(['user', 'moderator'])).toBe(20);
    });

    it('returns 0 for an empty array', () => {
      expect(boundary.getMaxLevel([])).toBe(0);
    });

    it('returns 0 for all-unknown roles', () => {
      expect(boundary.getMaxLevel(['ghost', 'phantom'])).toBe(0);
    });

    it('accounts for mixed known and unknown roles', () => {
      expect(boundary.getMaxLevel(['ghost', 'admin'])).toBe(50);
    });
  });

  describe('canAssignRole', () => {
    it('returns true when actor level is strictly greater than target level', () => {
      expect(boundary.canAssignRole(['admin'], 'user')).toBe(true);       // 50 > 10
      expect(boundary.canAssignRole(['superadmin'], 'admin')).toBe(true); // 100 > 50
    });

    it('returns false when actor level equals target level', () => {
      expect(boundary.canAssignRole(['admin'], 'admin')).toBe(false); // 50 == 50
    });

    it('returns false when actor level is lower than target level', () => {
      expect(boundary.canAssignRole(['user'], 'admin')).toBe(false);       // 10 < 50
      expect(boundary.canAssignRole(['moderator'], 'admin')).toBe(false);  // 20 < 50
    });

    it('uses the highest actor role when actor has multiple roles', () => {
      // moderator(20) + admin(50) → max 50 > user(10)
      expect(boundary.canAssignRole(['moderator', 'admin'], 'user')).toBe(true);
      // moderator(20) + user(10) → max 20, cannot assign admin(50)
      expect(boundary.canAssignRole(['moderator', 'user'], 'admin')).toBe(false);
    });

    it('returns false when actor has no roles (empty array)', () => {
      expect(boundary.canAssignRole([], 'user')).toBe(false); // 0 > 10 = false
    });
  });

  describe('enforceAssignment', () => {
    it('does not throw when actor can assign the role', () => {
      expect(() => boundary.enforceAssignment(['admin'], 'user')).not.toThrow();
    });

    it('throws ForbiddenException when actor cannot assign the role', () => {
      expect(() => boundary.enforceAssignment(['user'], 'admin')).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException at same level', () => {
      expect(() => boundary.enforceAssignment(['admin'], 'admin')).toThrow(ForbiddenException);
    });

    it('exception message contains role name and levels', () => {
      let msg = '';
      try {
        boundary.enforceAssignment(['user'], 'admin');
      } catch (e: unknown) {
        msg = (e as Error).message;
      }
      expect(msg).toContain('admin');
    });
  });

  describe('canModifyUser', () => {
    it('returns true when actor level is strictly greater than target user max level', () => {
      expect(boundary.canModifyUser(['admin'], ['user'])).toBe(true);         // 50 > 10
      expect(boundary.canModifyUser(['superadmin'], ['admin', 'user'])).toBe(true); // 100 > 50
    });

    it('returns false when actor level equals target user max level', () => {
      expect(boundary.canModifyUser(['admin'], ['admin'])).toBe(false); // 50 == 50
    });

    it('returns false when actor level is lower', () => {
      expect(boundary.canModifyUser(['user'], ['admin'])).toBe(false); // 10 < 50
    });

    it('uses the highest role on both sides', () => {
      // actor: moderator(20)+user(10)=20, target: moderator(20)=20 → false
      expect(boundary.canModifyUser(['moderator', 'user'], ['moderator'])).toBe(false);
      // actor: admin(50), target: moderator(20)+user(10)=20 → true
      expect(boundary.canModifyUser(['admin'], ['moderator', 'user'])).toBe(true);
    });
  });

  describe('enforceModification', () => {
    it('does not throw when actor can modify target', () => {
      expect(() => boundary.enforceModification(['admin'], ['user'])).not.toThrow();
    });

    it('throws ForbiddenException when actor cannot modify target', () => {
      expect(() => boundary.enforceModification(['user'], ['admin'])).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException at equal level', () => {
      expect(() => boundary.enforceModification(['admin'], ['admin'])).toThrow(ForbiddenException);
    });
  });

  describe('getAllRoles', () => {
    it('returns all defined roles sorted by level descending', () => {
      const roles = boundary.getAllRoles();
      expect(roles[0].name).toBe('superadmin'); // level 100
      expect(roles[roles.length - 1].name).toBe('user'); // level 10
      // verify strictly descending
      for (let i = 1; i < roles.length; i++) {
        expect(roles[i].level).toBeLessThanOrEqual(roles[i - 1].level);
      }
    });

    it('returns empty array when no roles defined', () => {
      const b = new PrivilegeBoundary();
      expect(b.getAllRoles()).toEqual([]);
    });
  });
});
