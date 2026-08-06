import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../../src/auth/guards/permissions.guard';
import { PERMISSIONS_KEY, IS_PUBLIC_KEY } from '../../../src/auth/constants';
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

describe('PermissionsGuard', () => {
  const authOptions: AuthOptions = { rbac: { enabled: true } };

  it('passes when user has ALL required permissions', () => {
    const { context, reflector } = createMockContext(
      { permissions: ['product:read', 'product:write', 'order:read'] },
      { [PERMISSIONS_KEY]: ['product:read', 'product:write'] },
    );
    const guard = new PermissionsGuard(reflector, authOptions);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks when user missing one permission', () => {
    const { context, reflector } = createMockContext(
      { permissions: ['product:read'] },
      { [PERMISSIONS_KEY]: ['product:read', 'product:write'] },
    );
    const guard = new PermissionsGuard(reflector, authOptions);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('passes when no @Permissions decorator', () => {
    const { context, reflector } = createMockContext({ permissions: [] }, {});
    const guard = new PermissionsGuard(reflector, authOptions);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes when @Public() is set', () => {
    const { context, reflector } = createMockContext(
      null,
      { [IS_PUBLIC_KEY]: true, [PERMISSIONS_KEY]: ['product:write'] },
    );
    const guard = new PermissionsGuard(reflector, authOptions);
    expect(guard.canActivate(context)).toBe(true);
  });
});
