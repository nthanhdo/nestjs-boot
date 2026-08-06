import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../../src/auth/guards/roles.guard';
import { ROLES_KEY, IS_PUBLIC_KEY } from '../../../src/auth/constants';
import { AuthOptions } from '../../../src/auth/interfaces';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

function createMockContext(user: any, metadata: Record<string, any> = {}): { context: ExecutionContext; reflector: Reflector } {
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

describe('RolesGuard', () => {
  const authOptions: AuthOptions = { rbac: { enabled: true } };

  it('passes when user has required role', () => {
    const { context, reflector } = createMockContext(
      { roles: ['admin', 'user'] },
      { [ROLES_KEY]: ['admin'] },
    );
    const guard = new RolesGuard(reflector, authOptions);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks when user lacks role', () => {
    const { context, reflector } = createMockContext(
      { roles: ['user'] },
      { [ROLES_KEY]: ['admin'] },
    );
    const guard = new RolesGuard(reflector, authOptions);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('passes when no @Roles decorator (no restriction)', () => {
    const { context, reflector } = createMockContext({ roles: [] }, {});
    const guard = new RolesGuard(reflector, authOptions);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes when @Public() is set', () => {
    const { context, reflector } = createMockContext(
      null,
      { [IS_PUBLIC_KEY]: true, [ROLES_KEY]: ['admin'] },
    );
    const guard = new RolesGuard(reflector, authOptions);
    expect(guard.canActivate(context)).toBe(true);
  });
});
