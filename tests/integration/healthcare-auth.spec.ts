import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';

// RBAC
import { RoleHierarchy } from '../../src/auth/rbac/role-hierarchy';
import { MemoryPermissionStore } from '../../src/auth/rbac/permission-store';
import { PrivilegeBoundary } from '../../src/auth/rbac/privilege-boundary';
import { RoleManager } from '../../src/auth/rbac/role-manager.service';

// Scope
import { ScopeResolver } from '../../src/scope/scope.resolver';
import { AccessScope } from '../../src/scope/interfaces';

// Policy
import { PolicyEngine } from '../../src/policy/policy.engine';
import { PolicyRegistry } from '../../src/policy/policy.registry';
import type { AuthorizationContext, AuthorizationPolicy } from '../../src/policy/interfaces';

// Organizations
import { OrganizationService } from '../../src/organizations/organization.service';
import { MemoryOrganizationStore } from '../../src/organizations/memory-organization.store';

// Audit
import { AuditService } from '../../src/audit/audit.service';
import { MemoryAuditStore } from '../../src/audit/memory-audit.store';
import { SecurityEventType } from '../../src/audit/interfaces';

// Auth
import { LoginTracker } from '../../src/auth/login-tracker/login-tracker';
import { MemoryTokenStore } from '../../src/auth/token/memory-token.store';

// ─────────────────────────────────────────────────────────────
// Healthcare domain constants
// ─────────────────────────────────────────────────────────────

const ROLES = {
  SUPER_ADMIN: { code: 'SUPER_ADMIN', name: 'Super Admin', level: 100, isSystem: true },
  ADMIN:       { code: 'ADMIN',       name: 'Admin',       level: 90,  isSystem: true },
  MANAGER:     { code: 'MANAGER',     name: 'Manager',     level: 70,  isSystem: true },
  MODERATOR:   { code: 'MODERATOR',   name: 'Moderator',   level: 50,  isSystem: true },
  LEADER:      { code: 'LEADER',      name: 'Leader',      level: 40,  isSystem: true },
  STAFF:       { code: 'STAFF',       name: 'Staff',       level: 20,  isSystem: true },
  USER:        { code: 'USER',        name: 'User',        level: 10,  isSystem: true },
} as const;

const PERMS = {
  USER_READ:           'user.read',
  USER_CREATE:         'user.create',
  USER_UPDATE:         'user.update',
  USER_DELETE:         'user.delete',
  ROLE_READ:           'role.read',
  ROLE_MANAGE:         'role.manage',
  TASK_READ:           'task.read',
  TASK_CREATE:         'task.create',
  TASK_ASSIGN:         'task.assign',
  TASK_COMPLETE:       'task.complete',
  REPORT_READ:         'report.read',
  REPORT_DETAIL_READ:  'report.detail.read',
  REPORT_EXPORT:       'report.export',
  AUDIT_LOG_READ:      'audit_log.read',
} as const;

// ─────────────────────────────────────────────────────────────
// Shared factory — recreated per describe block in beforeEach
// ─────────────────────────────────────────────────────────────

function buildHierarchy(): RoleHierarchy {
  return new RoleHierarchy([
    {
      name: 'SUPER_ADMIN',
      inherits: ['ADMIN'],
      permissions: [PERMS.AUDIT_LOG_READ, PERMS.ROLE_MANAGE],
    },
    {
      name: 'ADMIN',
      inherits: ['MANAGER'],
      permissions: [PERMS.USER_CREATE, PERMS.USER_DELETE, PERMS.ROLE_READ],
    },
    {
      name: 'MANAGER',
      inherits: ['MODERATOR'],
      permissions: [PERMS.USER_UPDATE, PERMS.REPORT_DETAIL_READ, PERMS.REPORT_EXPORT, PERMS.TASK_ASSIGN],
    },
    {
      name: 'MODERATOR',
      inherits: ['LEADER'],
      permissions: [PERMS.REPORT_READ, PERMS.USER_READ],
    },
    {
      name: 'LEADER',
      inherits: ['STAFF'],
      permissions: [PERMS.TASK_CREATE, PERMS.TASK_ASSIGN],
    },
    {
      name: 'STAFF',
      inherits: ['USER'],
      permissions: [PERMS.TASK_READ, PERMS.TASK_COMPLETE],
    },
    {
      name: 'USER',
      permissions: [PERMS.USER_READ],
    },
  ]);
}

function buildBoundary(): PrivilegeBoundary {
  return new PrivilegeBoundary(
    Object.values(ROLES).map(r => ({ name: r.code, level: r.level })),
  );
}

function buildAuditService(): AuditService {
  return new AuditService(
    new MemoryAuditStore(),
    { logDenials: true },
  );
}

function buildOrgService(): OrganizationService {
  return new OrganizationService(new MemoryOrganizationStore() as any);
}

// ─────────────────────────────────────────────────────────────
// 1. Role Hierarchy
// ─────────────────────────────────────────────────────────────

describe('Healthcare Auth Integration', () => {
  describe('Role Hierarchy', () => {
    let h: RoleHierarchy;

    beforeEach(() => { h = buildHierarchy(); });

    it('ADMIN resolves to include all inherited roles down to USER', () => {
      const resolved = h.resolve('ADMIN');
      expect(resolved).toContain('ADMIN');
      expect(resolved).toContain('MANAGER');
      expect(resolved).toContain('MODERATOR');
      expect(resolved).toContain('LEADER');
      expect(resolved).toContain('STAFF');
      expect(resolved).toContain('USER');
    });

    it('SUPER_ADMIN resolves to include every role', () => {
      const resolved = h.resolve('SUPER_ADMIN');
      for (const role of Object.keys(ROLES)) {
        expect(resolved).toContain(role);
      }
    });

    it('STAFF only resolves to STAFF + USER', () => {
      const resolved = h.resolve('STAFF');
      expect(resolved).toContain('STAFF');
      expect(resolved).toContain('USER');
      expect(resolved).not.toContain('MANAGER');
      expect(resolved).not.toContain('ADMIN');
    });

    it('ADMIN has user.read permission (inherited from USER)', () => {
      const perms = h.getPermissions('ADMIN');
      expect(perms).toContain(PERMS.USER_READ);
    });

    it('ADMIN has user.delete permission (direct)', () => {
      const perms = h.getPermissions('ADMIN');
      expect(perms).toContain(PERMS.USER_DELETE);
    });

    it('SUPER_ADMIN has audit_log.read permission (direct)', () => {
      const perms = h.getPermissions('SUPER_ADMIN');
      expect(perms).toContain(PERMS.AUDIT_LOG_READ);
    });

    it('USER does NOT have report.read permission', () => {
      const perms = h.getPermissions('USER');
      expect(perms).not.toContain(PERMS.REPORT_READ);
    });

    it('resolveAll merges roles without duplicating USER', () => {
      const resolved = h.resolveAll(['STAFF', 'USER']);
      expect(resolved.filter(r => r === 'USER')).toHaveLength(1);
    });

    it('hierarchy validates with no cycles', () => {
      const result = h.validate();
      expect(result.valid).toBe(true);
      expect(result.cycles).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Privilege Boundary
  // ─────────────────────────────────────────────────────────────

  describe('Privilege Boundary', () => {
    let boundary: PrivilegeBoundary;

    beforeEach(() => { boundary = buildBoundary(); });

    it('ADMIN (90) can assign MANAGER (70)', () => {
      expect(boundary.canAssignRole(['ADMIN'], 'MANAGER')).toBe(true);
    });

    it('ADMIN (90) CANNOT assign SUPER_ADMIN (100)', () => {
      expect(boundary.canAssignRole(['ADMIN'], 'SUPER_ADMIN')).toBe(false);
    });

    it('MANAGER (70) CANNOT assign ADMIN (90)', () => {
      expect(boundary.canAssignRole(['MANAGER'], 'ADMIN')).toBe(false);
    });

    it('same-level MANAGER cannot assign another MANAGER', () => {
      expect(boundary.canAssignRole(['MANAGER'], 'MANAGER')).toBe(false);
    });

    it('enforceAssignment throws ForbiddenException on violation', () => {
      expect(() => boundary.enforceAssignment(['STAFF'], 'ADMIN')).toThrow(ForbiddenException);
    });

    it('enforceAssignment does NOT throw when allowed', () => {
      expect(() => boundary.enforceAssignment(['ADMIN'], 'STAFF')).not.toThrow();
    });

    it('canModifyUser: ADMIN can modify a STAFF user', () => {
      expect(boundary.canModifyUser(['ADMIN'], ['STAFF'])).toBe(true);
    });

    it('canModifyUser: STAFF cannot modify an ADMIN user', () => {
      expect(boundary.canModifyUser(['STAFF'], ['ADMIN'])).toBe(false);
    });

    it('getMaxLevel returns highest level across multiple roles', () => {
      expect(boundary.getMaxLevel(['USER', 'MANAGER'])).toBe(70);
    });

    it('getAllRoles returns roles sorted by level descending', () => {
      const roles = boundary.getAllRoles();
      for (let i = 0; i < roles.length - 1; i++) {
        expect(roles[i].level).toBeGreaterThanOrEqual(roles[i + 1].level);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Scope Authorization
  // ─────────────────────────────────────────────────────────────

  describe('Scope Authorization', () => {
    let resolver: ScopeResolver;

    beforeEach(() => { resolver = new ScopeResolver(); });

    it('OWN scope is sufficient for OWN required', () => {
      expect(resolver.isScopeSufficient(AccessScope.OWN, AccessScope.OWN)).toBe(true);
    });

    it('OWN scope is NOT sufficient for TEAM required', () => {
      expect(resolver.isScopeSufficient(AccessScope.OWN, AccessScope.TEAM)).toBe(false);
    });

    it('DEPARTMENT scope is sufficient for TEAM required', () => {
      expect(resolver.isScopeSufficient(AccessScope.DEPARTMENT, AccessScope.TEAM)).toBe(true);
    });

    it('SYSTEM scope is sufficient for any scope', () => {
      for (const scope of Object.values(AccessScope)) {
        expect(resolver.isScopeSufficient(AccessScope.SYSTEM, scope)).toBe(true);
      }
    });

    it('buildScopeFilter for OWN returns ownerId filter', () => {
      const ctx = { userId: 'u1', organizationId: 'org1', departmentId: 'dept1', teamId: 'team1' };
      const filter = resolver.buildScopeFilter(AccessScope.OWN, ctx);
      expect(filter).toEqual({ ownerId: 'u1' });
    });

    it('buildScopeFilter for TEAM returns teamId filter', () => {
      const ctx = { userId: 'u1', teamId: 'team1' };
      const filter = resolver.buildScopeFilter(AccessScope.TEAM, ctx);
      expect(filter).toEqual({ teamId: 'team1' });
    });

    it('buildScopeFilter for DEPARTMENT returns departmentId filter', () => {
      const ctx = { userId: 'u1', departmentId: 'dept1' };
      const filter = resolver.buildScopeFilter(AccessScope.DEPARTMENT, ctx);
      expect(filter).toEqual({ departmentId: 'dept1' });
    });

    it('buildScopeFilter for ORGANIZATION returns organizationId filter', () => {
      const ctx = { userId: 'u1', organizationId: 'org1' };
      const filter = resolver.buildScopeFilter(AccessScope.ORGANIZATION, ctx);
      expect(filter).toEqual({ organizationId: 'org1' });
    });

    it('buildScopeFilter for SYSTEM returns empty filter (full access)', () => {
      const ctx = { userId: 'u1', organizationId: 'org1' };
      const filter = resolver.buildScopeFilter(AccessScope.SYSTEM, ctx);
      expect(filter).toEqual({});
    });

    it('resolveScope falls back to OWN when no scope on user', async () => {
      const scope = await resolver.resolveScope({ user: {} });
      expect(scope).toBe(AccessScope.OWN);
    });

    it('resolveScope reads scope from request.user.scope', async () => {
      const scope = await resolver.resolveScope({ user: { scope: AccessScope.DEPARTMENT } });
      expect(scope).toBe(AccessScope.DEPARTMENT);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Policy Engine
  // ─────────────────────────────────────────────────────────────

  describe('Policy Engine', () => {
    let registry: PolicyRegistry;
    let engine: PolicyEngine;

    // Department access policy: user.departmentId must match resource departmentId
    const departmentAccessPolicy: AuthorizationPolicy = {
      name: 'departmentAccess',
      async evaluate(ctx: AuthorizationContext) {
        const resourceDept = ctx.metadata?.resourceDepartmentId;
        if (!resourceDept) return { allowed: true, reason: 'No department restriction' };
        const allowed = ctx.user.departmentId === resourceDept;
        return {
          allowed,
          reason: allowed ? 'Same department' : 'Cross-department access denied',
        };
      },
    };

    // Org boundary policy: user.organizationId must match resource organizationId
    const orgBoundaryPolicy: AuthorizationPolicy = {
      name: 'organizationBoundary',
      async evaluate(ctx: AuthorizationContext) {
        const resourceOrg = ctx.metadata?.resourceOrganizationId;
        if (!resourceOrg) return { allowed: true, reason: 'No org restriction' };
        const allowed = ctx.user.organizationId === resourceOrg;
        return {
          allowed,
          reason: allowed ? 'Same organization' : 'Cross-org access denied',
        };
      },
    };

    beforeEach(() => {
      registry = new PolicyRegistry();
      registry.register(departmentAccessPolicy);
      registry.register(orgBoundaryPolicy);
      engine = new PolicyEngine(registry, { denyByDefault: true });
    });

    it('departmentAccess allows user in same department', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'u1', departmentId: 'cardiology' },
        action: 'patient.read',
        metadata: { resourceDepartmentId: 'cardiology' },
      };
      const result = await engine.evaluate('departmentAccess', ctx);
      expect(result.allowed).toBe(true);
    });

    it('departmentAccess denies cross-department access', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'u1', departmentId: 'cardiology' },
        action: 'patient.read',
        metadata: { resourceDepartmentId: 'neurology' },
      };
      const result = await engine.evaluate('departmentAccess', ctx);
      expect(result.allowed).toBe(false);
    });

    it('organizationBoundary allows same-org access', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'u1', organizationId: 'hosp-A' },
        action: 'report.read',
        metadata: { resourceOrganizationId: 'hosp-A' },
      };
      const result = await engine.evaluate('organizationBoundary', ctx);
      expect(result.allowed).toBe(true);
    });

    it('organizationBoundary denies cross-org access', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'u1', organizationId: 'hosp-A' },
        action: 'report.read',
        metadata: { resourceOrganizationId: 'hosp-B' },
      };
      const result = await engine.evaluate('organizationBoundary', ctx);
      expect(result.allowed).toBe(false);
    });

    it('evaluateAll passes when ALL policies allow', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'u1', organizationId: 'hosp-A', departmentId: 'cardiology' },
        action: 'patient.read',
        metadata: { resourceOrganizationId: 'hosp-A', resourceDepartmentId: 'cardiology' },
      };
      const result = await engine.evaluateAll(['departmentAccess', 'organizationBoundary'], ctx);
      expect(result.allowed).toBe(true);
    });

    it('evaluateAll denies when one policy fails (AND logic)', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'u1', organizationId: 'hosp-A', departmentId: 'cardiology' },
        action: 'patient.read',
        metadata: { resourceOrganizationId: 'hosp-A', resourceDepartmentId: 'neurology' },
      };
      const result = await engine.evaluateAll(['departmentAccess', 'organizationBoundary'], ctx);
      expect(result.allowed).toBe(false);
    });

    it('deny-by-default when policy not found', async () => {
      const ctx: AuthorizationContext = { user: { id: 'u1' }, action: 'unknown.action' };
      const result = await engine.evaluate('nonExistentPolicy', ctx);
      expect(result.allowed).toBe(false);
    });

    it('registry.has returns false for unregistered policy', () => {
      expect(registry.has('ghost')).toBe(false);
    });

    it('registry.getNames lists all registered policy names', () => {
      const names = registry.getNames();
      expect(names).toContain('departmentAccess');
      expect(names).toContain('organizationBoundary');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Organization Hierarchy
  // ─────────────────────────────────────────────────────────────

  describe('Organization Hierarchy', () => {
    let orgService: OrganizationService;

    beforeEach(() => { orgService = buildOrgService(); });

    it('creates an organization', async () => {
      const org = await orgService.createOrganization({ name: 'City Hospital', code: 'CITY' });
      expect(org.id).toBeDefined();
      expect(org.name).toBe('City Hospital');
    });

    it('creates departments under an organization', async () => {
      const org = await orgService.createOrganization({ name: 'City Hospital', code: 'CITY' });
      const dept = await orgService.createDepartment({ organizationId: org.id, name: 'Cardiology', code: 'CARD' });
      expect(dept.organizationId).toBe(org.id);
    });

    it('creates teams under a department', async () => {
      const org = await orgService.createOrganization({ name: 'City Hospital', code: 'CITY' });
      const dept = await orgService.createDepartment({ organizationId: org.id, name: 'Cardiology', code: 'CARD' });
      const team = await orgService.createTeam({ departmentId: dept.id, name: 'ICU Team', code: 'ICU' });
      expect(team.departmentId).toBe(dept.id);
    });

    it('adds users to teams and verifies membership', async () => {
      const org = await orgService.createOrganization({ name: 'City Hospital', code: 'CITY' });
      const dept = await orgService.createDepartment({ organizationId: org.id, name: 'Cardiology', code: 'CARD' });
      const team = await orgService.createTeam({ departmentId: dept.id, name: 'ICU Team', code: 'ICU' });

      await orgService.addMember({
        userId: 'doctor-1',
        organizationId: org.id,
        departmentId: dept.id,
        teamId: team.id,
        role: 'STAFF',
        joinedAt: new Date(),
      });

      const members = await orgService.getTeamMembers(team.id);
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe('doctor-1');
    });

    it('isUserInOrganization returns true for a member', async () => {
      const org = await orgService.createOrganization({ name: 'City Hospital', code: 'CITY' });
      await orgService.addMember({ userId: 'u1', organizationId: org.id, role: 'USER', joinedAt: new Date() });
      expect(await orgService.isUserInOrganization('u1', org.id)).toBe(true);
    });

    it('cross-org isolation: user in Org A is NOT in Org B', async () => {
      const orgA = await orgService.createOrganization({ name: 'Hospital A', code: 'HA' });
      const orgB = await orgService.createOrganization({ name: 'Hospital B', code: 'HB' });
      await orgService.addMember({ userId: 'u1', organizationId: orgA.id, role: 'USER', joinedAt: new Date() });
      expect(await orgService.isUserInOrganization('u1', orgB.id)).toBe(false);
    });

    it('department members include team-level members', async () => {
      const org = await orgService.createOrganization({ name: 'City Hospital', code: 'CITY' });
      const dept = await orgService.createDepartment({ organizationId: org.id, name: 'Cardiology', code: 'CARD' });
      await orgService.addMember({
        userId: 'nurse-1',
        organizationId: org.id,
        departmentId: dept.id,
        role: 'STAFF',
        joinedAt: new Date(),
      });
      const members = await orgService.getDepartmentMembers(dept.id);
      expect(members.some(m => m.userId === 'nurse-1')).toBe(true);
    });

    it('removes a member from an organization', async () => {
      const org = await orgService.createOrganization({ name: 'City Hospital', code: 'CITY' });
      await orgService.addMember({ userId: 'u1', organizationId: org.id, role: 'USER', joinedAt: new Date() });
      await orgService.removeMember('u1', org.id);
      expect(await orgService.isUserInOrganization('u1', org.id)).toBe(false);
    });

    it('throws ConflictException on duplicate org code', async () => {
      await orgService.createOrganization({ name: 'City Hospital', code: 'CITY' });
      await expect(orgService.createOrganization({ name: 'Another Hospital', code: 'CITY' })).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Audit Trail
  // ─────────────────────────────────────────────────────────────

  describe('Audit Trail', () => {
    let auditService: AuditService;

    beforeEach(() => { auditService = buildAuditService(); });

    it('logs an access grant and retrieves it by actor', async () => {
      await auditService.logAccess('doctor-1', 'patient.read', 'patient', 'pt-001');
      const entries = await auditService.findAuditEntries({ actorId: 'doctor-1' });
      expect(entries).toHaveLength(1);
      expect(entries[0].result).toBe('ALLOW');
      expect(entries[0].action).toBe('patient.read');
    });

    it('logs an access denial and retrieves it by result', async () => {
      await auditService.logDenial('nurse-1', 'report.export', 'report', 'rp-001');
      const entries = await auditService.findAuditEntries({ result: 'DENY' });
      expect(entries.some(e => e.actorId === 'nurse-1')).toBe(true);
    });

    it('logs a PRIVILEGE_ESCALATION_ATTEMPT security event', async () => {
      await auditService.logSecurityEvent({
        type: SecurityEventType.PRIVILEGE_ESCALATION_ATTEMPT,
        severity: 'HIGH',
        actorId: 'staff-1',
        description: 'Staff attempted to assign ADMIN role',
      });
      const events = await auditService.findSecurityEvents({
        type: SecurityEventType.PRIVILEGE_ESCALATION_ATTEMPT,
      });
      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe('HIGH');
    });

    it('logs ACCOUNT_LOCKED security event', async () => {
      await auditService.logSecurityEvent({
        type: SecurityEventType.ACCOUNT_LOCKED,
        severity: 'MEDIUM',
        actorId: 'user-x',
        description: 'Account locked after 5 failed attempts',
      });
      const events = await auditService.findSecurityEvents({ actorId: 'user-x' });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(SecurityEventType.ACCOUNT_LOCKED);
    });

    it('queries audit entries by resource', async () => {
      await auditService.logAccess('u1', 'task.read', 'task', 'task-1');
      await auditService.logAccess('u2', 'task.complete', 'task', 'task-1');
      await auditService.logAccess('u1', 'user.read', 'user', 'u-99');
      const entries = await auditService.findAuditEntries({ resource: 'task' });
      expect(entries).toHaveLength(2);
    });

    it('queries audit entries by action', async () => {
      await auditService.logAccess('u1', 'report.export', 'report');
      await auditService.logAccess('u2', 'report.read', 'report');
      const entries = await auditService.findAuditEntries({ action: 'report.export' });
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBe('u1');
    });

    it('log() with raw entry stores timestamp automatically', async () => {
      const before = new Date();
      await auditService.log({ actorId: 'u1', action: 'LOGIN', result: 'ALLOW' });
      const entries = await auditService.findAuditEntries({ actorId: 'u1' });
      expect(entries[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Login Tracking
  // ─────────────────────────────────────────────────────────────

  describe('Login Tracking', () => {
    it('account is not locked initially', () => {
      const tracker = new LoginTracker({ maxAttempts: 3 });
      expect(tracker.isLocked('user@hospital.com')).toBe(false);
    });

    it('records failures and tracks remaining attempts', () => {
      const tracker = new LoginTracker({ maxAttempts: 3 });
      tracker.recordFailure('user@hospital.com');
      expect(tracker.getRemainingAttempts('user@hospital.com')).toBe(2);
    });

    it('locks account after max attempts', () => {
      const tracker = new LoginTracker({ maxAttempts: 3, lockoutDuration: 60_000 });
      tracker.recordFailure('user@hospital.com');
      tracker.recordFailure('user@hospital.com');
      const locked = tracker.recordFailure('user@hospital.com');
      expect(locked).toBe(true);
      expect(tracker.isLocked('user@hospital.com')).toBe(true);
    });

    it('successful login resets failure count', () => {
      const tracker = new LoginTracker({ maxAttempts: 3 });
      tracker.recordFailure('user@hospital.com');
      tracker.recordFailure('user@hospital.com');
      tracker.recordSuccess('user@hospital.com');
      expect(tracker.getRemainingAttempts('user@hospital.com')).toBe(3);
      expect(tracker.isLocked('user@hospital.com')).toBe(false);
    });

    it('manual unlock releases a locked account', () => {
      const tracker = new LoginTracker({ maxAttempts: 2, lockoutDuration: 60_000 });
      tracker.recordFailure('admin@hospital.com');
      tracker.recordFailure('admin@hospital.com');
      expect(tracker.isLocked('admin@hospital.com')).toBe(true);
      tracker.unlock('admin@hospital.com');
      expect(tracker.isLocked('admin@hospital.com')).toBe(false);
    });

    it('lock expires after lockout duration', async () => {
      const tracker = new LoginTracker({ maxAttempts: 2, lockoutDuration: 1 }); // 1ms
      tracker.recordFailure('u@h.com');
      tracker.recordFailure('u@h.com');
      expect(tracker.isLocked('u@h.com')).toBe(true);
      await new Promise(r => setTimeout(r, 10)); // wait for lock to expire
      expect(tracker.isLocked('u@h.com')).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Token Family
  // ─────────────────────────────────────────────────────────────

  describe('Token Family', () => {
    let store: MemoryTokenStore;
    const future = new Date(Date.now() + 60_000);

    beforeEach(() => { store = new MemoryTokenStore(); });

    it('stores and retrieves a token', async () => {
      await store.storeToken('tok-1', 'fam-1', 'user-1', future);
      const t = await store.getToken('tok-1');
      expect(t).not.toBeNull();
      expect(t!.familyId).toBe('fam-1');
      expect(t!.used).toBe(false);
    });

    it('markUsed flags a token as used', async () => {
      await store.storeToken('tok-1', 'fam-1', 'user-1', future);
      await store.markUsed('tok-1');
      const t = await store.getToken('tok-1');
      expect(t!.used).toBe(true);
    });

    it('reuse detection: using a used token → revoke entire family', async () => {
      await store.storeToken('tok-1', 'fam-1', 'user-1', future);
      await store.storeToken('tok-2', 'fam-1', 'user-1', future);
      await store.markUsed('tok-1');

      // Simulate reuse: old used token re-presented → revoke family
      const t = await store.getToken('tok-1');
      if (t?.used) await store.revokeFamily(t.familyId);

      expect(await store.isFamilyRevoked('fam-1')).toBe(true);
      expect(await store.getToken('tok-2')).toBeNull(); // rotated token also revoked
    });

    it('revokeAllForUser removes all tokens for that user', async () => {
      await store.storeToken('tok-A', 'fam-A', 'user-1', future);
      await store.storeToken('tok-B', 'fam-B', 'user-1', future);
      await store.storeToken('tok-C', 'fam-C', 'user-2', future);

      await store.revokeAllForUser('user-1');

      expect(await store.getToken('tok-A')).toBeNull();
      expect(await store.getToken('tok-B')).toBeNull();
      expect(await store.getToken('tok-C')).not.toBeNull(); // other user unaffected
    });

    it('expired token returns null', async () => {
      const past = new Date(Date.now() - 1_000);
      await store.storeToken('tok-exp', 'fam-x', 'user-1', past);
      expect(await store.getToken('tok-exp')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Role Manager Seed (idempotent)
  // ─────────────────────────────────────────────────────────────

  describe('Role Manager Seed', () => {
    const permDefs = Object.values(PERMS).map(code => ({
      code,
      name: code,
      resource: code.split('.')[0],
      action: code.split('.').slice(1).join('.'),
    }));

    const roleDefs = [
      { ...ROLES.SUPER_ADMIN, permissions: [PERMS.AUDIT_LOG_READ, PERMS.ROLE_MANAGE], inherits: ['ADMIN'] },
      { ...ROLES.ADMIN,       permissions: [PERMS.USER_CREATE, PERMS.USER_DELETE, PERMS.ROLE_READ], inherits: ['MANAGER'] },
      { ...ROLES.MANAGER,     permissions: [PERMS.USER_UPDATE, PERMS.REPORT_EXPORT, PERMS.TASK_ASSIGN], inherits: ['MODERATOR'] },
      { ...ROLES.MODERATOR,   permissions: [PERMS.REPORT_READ, PERMS.USER_READ], inherits: ['LEADER'] },
      { ...ROLES.LEADER,      permissions: [PERMS.TASK_CREATE], inherits: ['STAFF'] },
      { ...ROLES.STAFF,       permissions: [PERMS.TASK_READ, PERMS.TASK_COMPLETE], inherits: ['USER'] },
      { ...ROLES.USER,        permissions: [PERMS.USER_READ], inherits: [] },
    ];

    it('seeds all 7 system roles and all permissions', () => {
      const manager = new RoleManager(new MemoryPermissionStore());
      const result = manager.seed(roleDefs, permDefs);
      expect(result.rolesCreated).toBe(7);
      expect(result.permissionsCreated).toBe(permDefs.length);
    });

    it('seed is idempotent — running twice produces no duplicates', () => {
      const manager = new RoleManager(new MemoryPermissionStore());
      manager.seed(roleDefs, permDefs);
      const second = manager.seed(roleDefs, permDefs);
      expect(second.rolesCreated).toBe(0);
      expect(second.permissionsCreated).toBe(0);
    });

    it('all 7 system roles exist after seed', () => {
      const manager = new RoleManager(new MemoryPermissionStore());
      manager.seed(roleDefs, permDefs);
      const roles = manager.listRoles();
      expect(roles).toHaveLength(7);
      const codes = roles.map(r => r.code);
      for (const role of Object.keys(ROLES)) {
        expect(codes).toContain(role);
      }
    });

    it('roles are returned sorted by level descending', () => {
      const manager = new RoleManager(new MemoryPermissionStore());
      manager.seed(roleDefs, permDefs);
      const roles = manager.listRoles();
      for (let i = 0; i < roles.length - 1; i++) {
        expect(roles[i].level).toBeGreaterThanOrEqual(roles[i + 1].level);
      }
    });

    it('SUPER_ADMIN has correct permissions after seed', () => {
      const manager = new RoleManager(new MemoryPermissionStore());
      manager.seed(roleDefs, permDefs);
      const perms = manager.getRolePermissions('SUPER_ADMIN');
      expect(perms).toContain(PERMS.AUDIT_LOG_READ);
      expect(perms).toContain(PERMS.ROLE_MANAGE);
    });

    it('cannot delete a system role', () => {
      const manager = new RoleManager(new MemoryPermissionStore());
      manager.seed(roleDefs, permDefs);
      expect(() => manager.deleteRole('ADMIN')).toThrow();
    });

    it('assignRoleToUser respects privilege boundary', async () => {
      const boundary = buildBoundary();
      const manager = new RoleManager(new MemoryPermissionStore(), boundary);
      manager.seed(roleDefs, permDefs);

      // ADMIN (90) assigning STAFF (20) → allowed
      await expect(
        manager.assignRoleToUser('user-1', 'STAFF', ['ADMIN']),
      ).resolves.not.toThrow();

      // STAFF (20) assigning ADMIN (90) → denied
      await expect(
        manager.assignRoleToUser('user-2', 'ADMIN', ['STAFF']),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Full Healthcare Scenario
  // ─────────────────────────────────────────────────────────────

  describe('Full Healthcare Scenario', () => {
    let orgService: OrganizationService;
    let auditService: AuditService;
    let scopeResolver: ScopeResolver;
    let policyEngine: PolicyEngine;
    let boundary: PrivilegeBoundary;
    let loginTracker: LoginTracker;
    let tokenStore: MemoryTokenStore;

    // Hospital structure
    let hospitalOrgId: string;
    let cardiologyDeptId: string;
    let neurologyDeptId: string;
    let cardiologyTeamId: string;

    beforeEach(async () => {
      orgService = buildOrgService();
      auditService = buildAuditService();
      scopeResolver = new ScopeResolver();
      boundary = buildBoundary();
      loginTracker = new LoginTracker({ maxAttempts: 5 });
      tokenStore = new MemoryTokenStore();

      const registry = new PolicyRegistry();
      registry.register({
        name: 'departmentAccess',
        async evaluate(ctx: AuthorizationContext) {
          const resourceDept = ctx.metadata?.resourceDepartmentId;
          if (!resourceDept) return { allowed: true };
          return {
            allowed: ctx.user.departmentId === resourceDept,
            reason: ctx.user.departmentId === resourceDept ? 'Same department' : 'Cross-department denied',
          };
        },
      });
      registry.register({
        name: 'organizationBoundary',
        async evaluate(ctx: AuthorizationContext) {
          const resourceOrg = ctx.metadata?.resourceOrganizationId;
          if (!resourceOrg) return { allowed: true };
          return {
            allowed: ctx.user.organizationId === resourceOrg,
            reason: ctx.user.organizationId === resourceOrg ? 'Same org' : 'Cross-org denied',
          };
        },
      });
      policyEngine = new PolicyEngine(registry, { denyByDefault: true });

      // Build hospital structure
      const hospital = await orgService.createOrganization({ name: 'City General Hospital', code: 'CGH' });
      hospitalOrgId = hospital.id;

      const cardiology = await orgService.createDepartment({ organizationId: hospitalOrgId, name: 'Cardiology', code: 'CARD' });
      cardiologyDeptId = cardiology.id;

      const neurology = await orgService.createDepartment({ organizationId: hospitalOrgId, name: 'Neurology', code: 'NEUR' });
      neurologyDeptId = neurology.id;

      const cardiologyTeam = await orgService.createTeam({ departmentId: cardiologyDeptId, name: 'Cardiology ICU', code: 'CARD-ICU' });
      cardiologyTeamId = cardiologyTeam.id;

      // Add users
      await orgService.addMember({ userId: 'doctor-1', organizationId: hospitalOrgId, departmentId: cardiologyDeptId, teamId: cardiologyTeamId, role: 'STAFF', joinedAt: new Date() });
      await orgService.addMember({ userId: 'nurse-1',  organizationId: hospitalOrgId, departmentId: cardiologyDeptId, teamId: cardiologyTeamId, role: 'STAFF', joinedAt: new Date() });
      await orgService.addMember({ userId: 'manager-1', organizationId: hospitalOrgId, departmentId: cardiologyDeptId, role: 'MANAGER', joinedAt: new Date() });
      await orgService.addMember({ userId: 'admin-1',  organizationId: hospitalOrgId, role: 'ADMIN', joinedAt: new Date() });
      await orgService.addMember({ userId: 'neuro-doc', organizationId: hospitalOrgId, departmentId: neurologyDeptId, role: 'STAFF', joinedAt: new Date() });
    });

    it('doctor in Cardiology can read Cardiology patients (same-dept policy)', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'doctor-1', organizationId: hospitalOrgId, departmentId: cardiologyDeptId },
        action: 'patient.read',
        metadata: { resourceOrganizationId: hospitalOrgId, resourceDepartmentId: cardiologyDeptId },
      };
      const result = await policyEngine.evaluateAll(['organizationBoundary', 'departmentAccess'], ctx);
      expect(result.allowed).toBe(true);
      await auditService.logAccess('doctor-1', 'patient.read', 'patient', 'pt-001');
    });

    it('doctor in Cardiology CANNOT read Neurology patients (cross-dept denied)', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'doctor-1', organizationId: hospitalOrgId, departmentId: cardiologyDeptId },
        action: 'patient.read',
        metadata: { resourceOrganizationId: hospitalOrgId, resourceDepartmentId: neurologyDeptId },
      };
      const result = await policyEngine.evaluateAll(['organizationBoundary', 'departmentAccess'], ctx);
      expect(result.allowed).toBe(false);
      await auditService.logDenial('doctor-1', 'patient.read', 'patient');
    });

    it('nurse in Cardiology can read Cardiology patients', async () => {
      const ctx: AuthorizationContext = {
        user: { id: 'nurse-1', organizationId: hospitalOrgId, departmentId: cardiologyDeptId },
        action: 'patient.read',
        metadata: { resourceOrganizationId: hospitalOrgId, resourceDepartmentId: cardiologyDeptId },
      };
      const result = await policyEngine.evaluateAll(['organizationBoundary', 'departmentAccess'], ctx);
      expect(result.allowed).toBe(true);
    });

    it('STAFF scope restricts to OWN tasks only', () => {
      const ctx = { userId: 'doctor-1' };
      const filter = scopeResolver.buildScopeFilter(AccessScope.OWN, ctx);
      expect(filter).toEqual({ ownerId: 'doctor-1' });
    });

    it('MANAGER scope allows reading DEPARTMENT reports', () => {
      expect(scopeResolver.isScopeSufficient(AccessScope.DEPARTMENT, AccessScope.DEPARTMENT)).toBe(true);
    });

    it('ADMIN can manage users across the organization', () => {
      expect(boundary.canAssignRole(['ADMIN'], 'STAFF')).toBe(true);
      expect(boundary.canAssignRole(['ADMIN'], 'MANAGER')).toBe(true);
    });

    it('ADMIN cannot escalate to SUPER_ADMIN', () => {
      expect(boundary.canAssignRole(['ADMIN'], 'SUPER_ADMIN')).toBe(false);
    });

    it('SUPER_ADMIN has SYSTEM scope (full access)', () => {
      expect(scopeResolver.isScopeSufficient(AccessScope.SYSTEM, AccessScope.ORGANIZATION)).toBe(true);
    });

    it('cross-org: doctor in Hospital A cannot access Hospital B data', async () => {
      const hospB = await orgService.createOrganization({ name: 'East Side Clinic', code: 'ESC' });
      const ctx: AuthorizationContext = {
        user: { id: 'doctor-1', organizationId: hospitalOrgId },
        action: 'patient.read',
        metadata: { resourceOrganizationId: hospB.id },
      };
      const result = await policyEngine.evaluate('organizationBoundary', ctx);
      expect(result.allowed).toBe(false);
    });

    it('all denied actions appear in audit trail', async () => {
      await auditService.logDenial('doctor-1', 'patient.read', 'patient', 'neuro-pt-1');
      await auditService.logDenial('nurse-1', 'report.export', 'report');
      const denials = await auditService.findAuditEntries({ result: 'DENY' });
      expect(denials.length).toBeGreaterThanOrEqual(2);
    });

    it('doctor membership: verified in org + dept + team', async () => {
      expect(await orgService.isUserInOrganization('doctor-1', hospitalOrgId)).toBe(true);
      expect(await orgService.isUserInDepartment('doctor-1', cardiologyDeptId)).toBe(true);
      expect(await orgService.isUserInTeam('doctor-1', cardiologyTeamId)).toBe(true);
    });

    it('neurology doctor is NOT in cardiology department', async () => {
      expect(await orgService.isUserInDepartment('neuro-doc', cardiologyDeptId)).toBe(false);
    });

    it('failed logins are tracked and lock the account', () => {
      for (let i = 0; i < 5; i++) loginTracker.recordFailure('attacker@evil.com');
      expect(loginTracker.isLocked('attacker@evil.com')).toBe(true);
    });

    it('token rotation: old token marked used, new token valid in same family', async () => {
      const future = new Date(Date.now() + 3_600_000);
      await tokenStore.storeToken('refresh-v1', 'family-A', 'doctor-1', future);
      await tokenStore.markUsed('refresh-v1');
      await tokenStore.storeToken('refresh-v2', 'family-A', 'doctor-1', future);

      const v1 = await tokenStore.getToken('refresh-v1');
      const v2 = await tokenStore.getToken('refresh-v2');
      expect(v1!.used).toBe(true);
      expect(v2!.used).toBe(false);
    });

    it('logout revokes all tokens for the user', async () => {
      const future = new Date(Date.now() + 3_600_000);
      await tokenStore.storeToken('rt-A', 'fam-A', 'doctor-1', future);
      await tokenStore.storeToken('rt-B', 'fam-B', 'doctor-1', future);
      await tokenStore.revokeAllForUser('doctor-1');
      expect(await tokenStore.getToken('rt-A')).toBeNull();
      expect(await tokenStore.getToken('rt-B')).toBeNull();
    });
  });
});
