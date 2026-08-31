import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ScopeResolver } from '../../src/scope/scope.resolver';
import { ScopeGuard } from '../../src/scope/scope.guard';
import { AccessScope, SCOPE_LEVELS } from '../../src/scope/interfaces';
import { SCOPE_KEY } from '../../src/scope/constants';
import { IS_PUBLIC_KEY } from '../../src/auth/constants';

function createMockContext(
  user: any,
  metadata: Record<string, any> = {},
): { context: ExecutionContext; reflector: Reflector } {
  const request = { user };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  const reflector = new Reflector();
  reflector.getAllAndOverride = ((key: string, _targets: any[]) => {
    return metadata[key] ?? undefined;
  }) as any;

  return { context, reflector };
}

// ---------------------------------------------------------------------------
// ScopeResolver — isScopeSufficient
// ---------------------------------------------------------------------------
describe('ScopeResolver.isScopeSufficient', () => {
  const resolver = new ScopeResolver();

  it('OWN < TEAM: OWN does not meet TEAM', () => {
    expect(resolver.isScopeSufficient(AccessScope.OWN, AccessScope.TEAM)).toBe(false);
  });

  it('TEAM >= OWN: TEAM meets OWN', () => {
    expect(resolver.isScopeSufficient(AccessScope.TEAM, AccessScope.OWN)).toBe(true);
  });

  it('TEAM < DEPARTMENT: TEAM does not meet DEPARTMENT', () => {
    expect(resolver.isScopeSufficient(AccessScope.TEAM, AccessScope.DEPARTMENT)).toBe(false);
  });

  it('DEPARTMENT >= TEAM: DEPARTMENT meets TEAM', () => {
    expect(resolver.isScopeSufficient(AccessScope.DEPARTMENT, AccessScope.TEAM)).toBe(true);
  });

  it('DEPARTMENT < ORGANIZATION: DEPARTMENT does not meet ORGANIZATION', () => {
    expect(resolver.isScopeSufficient(AccessScope.DEPARTMENT, AccessScope.ORGANIZATION)).toBe(false);
  });

  it('ORGANIZATION >= DEPARTMENT: ORGANIZATION meets DEPARTMENT', () => {
    expect(resolver.isScopeSufficient(AccessScope.ORGANIZATION, AccessScope.DEPARTMENT)).toBe(true);
  });

  it('ORGANIZATION < SYSTEM: ORGANIZATION does not meet SYSTEM', () => {
    expect(resolver.isScopeSufficient(AccessScope.ORGANIZATION, AccessScope.SYSTEM)).toBe(false);
  });

  it('SYSTEM >= ORGANIZATION: SYSTEM meets ORGANIZATION', () => {
    expect(resolver.isScopeSufficient(AccessScope.SYSTEM, AccessScope.ORGANIZATION)).toBe(true);
  });

  it('same scope: meets itself', () => {
    for (const scope of Object.values(AccessScope)) {
      expect(resolver.isScopeSufficient(scope, scope)).toBe(true);
    }
  });

  it('SCOPE_LEVELS are strictly ordered OWN < TEAM < DEPARTMENT < ORGANIZATION < SYSTEM', () => {
    expect(SCOPE_LEVELS[AccessScope.OWN]).toBeLessThan(SCOPE_LEVELS[AccessScope.TEAM]);
    expect(SCOPE_LEVELS[AccessScope.TEAM]).toBeLessThan(SCOPE_LEVELS[AccessScope.DEPARTMENT]);
    expect(SCOPE_LEVELS[AccessScope.DEPARTMENT]).toBeLessThan(SCOPE_LEVELS[AccessScope.ORGANIZATION]);
    expect(SCOPE_LEVELS[AccessScope.ORGANIZATION]).toBeLessThan(SCOPE_LEVELS[AccessScope.SYSTEM]);
  });
});

// ---------------------------------------------------------------------------
// ScopeResolver — buildScopeFilter
// ---------------------------------------------------------------------------
describe('ScopeResolver.buildScopeFilter', () => {
  const resolver = new ScopeResolver();
  const ctx = {
    userId: 'u1',
    organizationId: 'org1',
    departmentId: 'dept1',
    teamId: 'team1',
  };

  it('OWN → filters by ownerId', () => {
    expect(resolver.buildScopeFilter(AccessScope.OWN, ctx)).toEqual({ ownerId: 'u1' });
  });

  it('TEAM → filters by teamId when present', () => {
    expect(resolver.buildScopeFilter(AccessScope.TEAM, ctx)).toEqual({ teamId: 'team1' });
  });

  it('TEAM → falls back to ownerId when teamId absent', () => {
    expect(resolver.buildScopeFilter(AccessScope.TEAM, { userId: 'u1' })).toEqual({ ownerId: 'u1' });
  });

  it('DEPARTMENT → filters by departmentId when present', () => {
    expect(resolver.buildScopeFilter(AccessScope.DEPARTMENT, ctx)).toEqual({ departmentId: 'dept1' });
  });

  it('DEPARTMENT → falls back to ownerId when departmentId absent', () => {
    expect(resolver.buildScopeFilter(AccessScope.DEPARTMENT, { userId: 'u1' })).toEqual({ ownerId: 'u1' });
  });

  it('ORGANIZATION → filters by organizationId when present', () => {
    expect(resolver.buildScopeFilter(AccessScope.ORGANIZATION, ctx)).toEqual({ organizationId: 'org1' });
  });

  it('ORGANIZATION → falls back to ownerId when organizationId absent', () => {
    expect(resolver.buildScopeFilter(AccessScope.ORGANIZATION, { userId: 'u1' })).toEqual({ ownerId: 'u1' });
  });

  it('SYSTEM → returns empty filter (no restriction)', () => {
    expect(resolver.buildScopeFilter(AccessScope.SYSTEM, ctx)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// ScopeResolver — extractContext
// ---------------------------------------------------------------------------
describe('ScopeResolver.extractContext', () => {
  it('default: reads from request.user using sub', async () => {
    const resolver = new ScopeResolver();
    const request = { user: { sub: 'u1', organizationId: 'org1', departmentId: 'dept1', teamId: 'team1' } };
    const ctx = await resolver.extractContext(request);
    expect(ctx).toEqual({ userId: 'u1', organizationId: 'org1', departmentId: 'dept1', teamId: 'team1' });
  });

  it('default: reads from request.user using id when sub absent', async () => {
    const resolver = new ScopeResolver();
    const request = { user: { id: 'u2' } };
    const ctx = await resolver.extractContext(request);
    expect(ctx.userId).toBe('u2');
  });

  it('custom extractContext is called', async () => {
    const resolver = new ScopeResolver({
      extractContext: (_req) => ({ userId: 'custom-user', organizationId: 'custom-org' }),
    });
    const ctx = await resolver.extractContext({});
    expect(ctx).toEqual({ userId: 'custom-user', organizationId: 'custom-org' });
  });

  it('custom extractContext can be async', async () => {
    const resolver = new ScopeResolver({
      extractContext: async (_req) => ({ userId: 'async-user' }),
    });
    const ctx = await resolver.extractContext({});
    expect(ctx.userId).toBe('async-user');
  });
});

// ---------------------------------------------------------------------------
// ScopeResolver — resolveScope
// ---------------------------------------------------------------------------
describe('ScopeResolver.resolveScope', () => {
  it('default: reads scope from request.user.scope', async () => {
    const resolver = new ScopeResolver();
    const request = { user: { scope: AccessScope.ORGANIZATION } };
    expect(await resolver.resolveScope(request)).toBe(AccessScope.ORGANIZATION);
  });

  it('default: falls back to OWN when scope absent', async () => {
    const resolver = new ScopeResolver();
    expect(await resolver.resolveScope({ user: {} })).toBe(AccessScope.OWN);
  });

  it('default: falls back to configured defaultScope', async () => {
    const resolver = new ScopeResolver({ defaultScope: AccessScope.TEAM });
    expect(await resolver.resolveScope({ user: {} })).toBe(AccessScope.TEAM);
  });

  it('ignores unknown scope strings', async () => {
    const resolver = new ScopeResolver();
    const request = { user: { scope: 'UNKNOWN' } };
    expect(await resolver.resolveScope(request)).toBe(AccessScope.OWN);
  });

  it('custom resolveScope is called', async () => {
    const resolver = new ScopeResolver({
      resolveScope: (_req) => AccessScope.SYSTEM,
    });
    expect(await resolver.resolveScope({})).toBe(AccessScope.SYSTEM);
  });

  it('custom resolveScope can be async', async () => {
    const resolver = new ScopeResolver({
      resolveScope: async (_req) => AccessScope.DEPARTMENT,
    });
    expect(await resolver.resolveScope({})).toBe(AccessScope.DEPARTMENT);
  });
});

// ---------------------------------------------------------------------------
// ScopeGuard
// ---------------------------------------------------------------------------
describe('ScopeGuard', () => {
  function makeGuard(
    userScope: AccessScope,
    metadata: Record<string, any> = {},
  ): { guard: ScopeGuard; ctx: ExecutionContext } {
    const resolver = new ScopeResolver({ resolveScope: (_req) => userScope });
    const { context, reflector } = createMockContext({ scope: userScope }, metadata);
    const guard = new ScopeGuard(reflector, resolver);
    return { guard, ctx: context };
  }

  it('allows when user scope meets required scope (exact match)', async () => {
    const { guard, ctx } = makeGuard(AccessScope.DEPARTMENT, { [SCOPE_KEY]: AccessScope.DEPARTMENT });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows when user scope exceeds required scope (SYSTEM meets OWN)', async () => {
    const { guard, ctx } = makeGuard(AccessScope.SYSTEM, { [SCOPE_KEY]: AccessScope.OWN });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('denies when user scope is insufficient (OWN does not meet ORGANIZATION)', async () => {
    const { guard, ctx } = makeGuard(AccessScope.OWN, { [SCOPE_KEY]: AccessScope.ORGANIZATION });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('denies with meaningful message', async () => {
    const { guard, ctx } = makeGuard(AccessScope.TEAM, { [SCOPE_KEY]: AccessScope.SYSTEM });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Insufficient scope: requires SYSTEM, user has TEAM',
    );
  });

  it('passes when no @RequireScope() decorator (no restriction)', async () => {
    const { guard, ctx } = makeGuard(AccessScope.OWN, {});
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('passes when @Public() is set regardless of scope', async () => {
    const { guard, ctx } = makeGuard(AccessScope.OWN, {
      [IS_PUBLIC_KEY]: true,
      [SCOPE_KEY]: AccessScope.SYSTEM,
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });
});
