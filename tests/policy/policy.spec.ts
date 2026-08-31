import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PolicyRegistry } from '../../src/policy/policy.registry';
import { PolicyEngine } from '../../src/policy/policy.engine';
import { PolicyGuard } from '../../src/policy/policy.guard';
import { POLICY_KEY } from '../../src/policy/constants';
import { AuthorizationContext, AuthorizationPolicy, AuthorizationResult } from '../../src/policy/interfaces';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePolicy(name: string, result: AuthorizationResult): AuthorizationPolicy {
  return {
    name,
    evaluate: vi.fn().mockResolvedValue(result),
  };
}

function makeContext(user: any, params: any = {}, metadataMap: Record<string, any> = {}): ExecutionContext {
  const request = { user, params };
  const reflector = new Reflector();
  reflector.getAllAndOverride = ((key: string, _targets: any[]) => metadataMap[key] ?? undefined) as any;

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    _reflector: reflector,
  } as any;
}

// ---------------------------------------------------------------------------
// PolicyRegistry
// ---------------------------------------------------------------------------

describe('PolicyRegistry', () => {
  let registry: PolicyRegistry;

  beforeEach(() => {
    registry = new PolicyRegistry();
  });

  it('registers and retrieves a policy', () => {
    const policy = makePolicy('myPolicy', { allowed: true });
    registry.register(policy);
    expect(registry.get('myPolicy')).toBe(policy);
  });

  it('has() returns true after registration', () => {
    registry.register(makePolicy('p1', { allowed: true }));
    expect(registry.has('p1')).toBe(true);
    expect(registry.has('p2')).toBe(false);
  });

  it('getAll() returns all registered policies', () => {
    const p1 = makePolicy('p1', { allowed: true });
    const p2 = makePolicy('p2', { allowed: false });
    registry.register(p1);
    registry.register(p2);
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getNames() returns policy names', () => {
    registry.register(makePolicy('alpha', { allowed: true }));
    registry.register(makePolicy('beta', { allowed: true }));
    expect(registry.getNames()).toEqual(expect.arrayContaining(['alpha', 'beta']));
  });

  it('overwrites existing policy and warns', () => {
    const warnSpy = vi.spyOn((registry as any).logger, 'warn').mockImplementation(() => {});
    const p1 = makePolicy('dup', { allowed: true });
    const p2 = makePolicy('dup', { allowed: false });
    registry.register(p1);
    registry.register(p2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dup'));
    expect(registry.get('dup')).toBe(p2);
  });
});

// ---------------------------------------------------------------------------
// PolicyEngine
// ---------------------------------------------------------------------------

describe('PolicyEngine', () => {
  let registry: PolicyRegistry;

  beforeEach(() => {
    registry = new PolicyRegistry();
  });

  describe('evaluate()', () => {
    it('returns allowed when policy evaluates to allowed', async () => {
      const policy = makePolicy('allow', { allowed: true, reason: 'OK' });
      registry.register(policy);
      const engine = new PolicyEngine(registry);
      const ctx: AuthorizationContext = { user: { id: 'u1' }, action: 'read' };
      const result = await engine.evaluate('allow', ctx);
      expect(result.allowed).toBe(true);
      expect(result.policy).toBe('allow');
    });

    it('returns denied when policy evaluates to denied', async () => {
      const policy = makePolicy('deny', { allowed: false, reason: 'No access' });
      registry.register(policy);
      const engine = new PolicyEngine(registry);
      const ctx: AuthorizationContext = { user: { id: 'u1' }, action: 'write' };
      const result = await engine.evaluate('deny', ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('No access');
    });

    it('denies by default when policy not found (denyByDefault: true)', async () => {
      const engine = new PolicyEngine(registry, { denyByDefault: true });
      const ctx: AuthorizationContext = { user: { id: 'u1' }, action: 'read' };
      const result = await engine.evaluate('missing', ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('missing');
    });

    it('allows when policy not found and denyByDefault: false', async () => {
      const engine = new PolicyEngine(registry, { denyByDefault: false });
      const ctx: AuthorizationContext = { user: { id: 'u1' }, action: 'read' };
      const result = await engine.evaluate('missing', ctx);
      expect(result.allowed).toBe(true);
    });

    it('returns denied when policy throws', async () => {
      const policy: AuthorizationPolicy = {
        name: 'throws',
        evaluate: vi.fn().mockRejectedValue(new Error('boom')),
      };
      registry.register(policy);
      const engine = new PolicyEngine(registry);
      const ctx: AuthorizationContext = { user: { id: 'u1' }, action: 'read' };
      const result = await engine.evaluate('throws', ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('boom');
    });
  });

  describe('evaluateAll()', () => {
    it('allows when all policies pass', async () => {
      registry.register(makePolicy('p1', { allowed: true }));
      registry.register(makePolicy('p2', { allowed: true }));
      const engine = new PolicyEngine(registry);
      const ctx: AuthorizationContext = { user: { id: 'u1' }, action: 'read' };
      const result = await engine.evaluateAll(['p1', 'p2'], ctx);
      expect(result.allowed).toBe(true);
    });

    it('stops and denies when one policy fails', async () => {
      registry.register(makePolicy('p1', { allowed: true }));
      const p2 = makePolicy('p2', { allowed: false, reason: 'denied by p2' });
      registry.register(p2);
      const p3 = makePolicy('p3', { allowed: true });
      registry.register(p3);
      const engine = new PolicyEngine(registry);
      const ctx: AuthorizationContext = { user: { id: 'u1' }, action: 'read' };
      const result = await engine.evaluateAll(['p1', 'p2', 'p3'], ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('denied by p2');
      // p3 should not have been evaluated
      expect(p3.evaluate).not.toHaveBeenCalled();
    });
  });

  describe('buildContext()', () => {
    it('extracts user fields from req.user by default', async () => {
      const engine = new PolicyEngine(registry);
      const req = {
        user: {
          sub: 'user-123',
          roles: ['admin'],
          permissions: ['read'],
          organizationId: 'org-1',
          departmentId: 'dept-1',
          teamId: 'team-1',
        },
        params: { id: 'res-42' },
      };
      const ctx = await engine.buildContext(req, { resource: 'report' });
      expect(ctx.user.id).toBe('user-123');
      expect(ctx.user.roles).toEqual(['admin']);
      expect(ctx.resourceId).toBe('res-42');
      expect(ctx.resource).toBe('report');
      expect(ctx.organizationId).toBe('org-1');
    });

    it('uses custom buildContext when provided', async () => {
      const customCtx: AuthorizationContext = { user: { id: 'custom' }, action: 'custom.action' };
      const engine = new PolicyEngine(registry, {
        buildContext: vi.fn().mockResolvedValue(customCtx),
      });
      const result = await engine.buildContext({}, {});
      expect(result).toBe(customCtx);
    });
  });
});

// ---------------------------------------------------------------------------
// PolicyGuard
// ---------------------------------------------------------------------------

describe('PolicyGuard', () => {
  let registry: PolicyRegistry;
  let engine: PolicyEngine;

  function makeGuardContext(
    user: any,
    metadataMap: Record<string, any> = {},
    params: any = {},
  ): { guard: PolicyGuard; context: ExecutionContext } {
    const request = { user, params };
    const reflector = {
      getAllAndOverride: (key: string, _targets: any[]) => metadataMap[key] ?? undefined,
    } as unknown as Reflector;

    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const guard = new PolicyGuard(reflector, engine);
    return { guard, context };
  }

  beforeEach(() => {
    registry = new PolicyRegistry();
    engine = new PolicyEngine(registry);
  });

  it('passes when @Public() is set', async () => {
    const { guard, context } = makeGuardContext(null, { 'boot:isPublic': true, [POLICY_KEY]: { policyName: 'any' } });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('passes when no @CheckPolicy() decorator', async () => {
    const { guard, context } = makeGuardContext({ id: 'u1' }, {});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('passes when policy allows', async () => {
    registry.register(makePolicy('allowed', { allowed: true }));
    const { guard, context } = makeGuardContext(
      { id: 'u1' },
      { [POLICY_KEY]: { policyName: 'allowed' } },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws ForbiddenException when policy denies', async () => {
    registry.register(makePolicy('denied', { allowed: false, reason: 'not allowed' }));
    const { guard, context } = makeGuardContext(
      { id: 'u1' },
      { [POLICY_KEY]: { policyName: 'denied' } },
    );
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException with default message when reason missing', async () => {
    registry.register(makePolicy('silent-deny', { allowed: false }));
    const { guard, context } = makeGuardContext(
      { id: 'u1' },
      { [POLICY_KEY]: { policyName: 'silent-deny' } },
    );
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
