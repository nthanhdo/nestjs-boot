import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from '../../../src/auth/guards/api-key.guard';
import { IS_PUBLIC_KEY } from '../../../src/auth/constants';
import { AuthOptions } from '../../../src/auth/interfaces';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

function createMockContext(headers: Record<string, string>, metadata: Record<string, any> = {}): { context: ExecutionContext; reflector: Reflector } {
  const request = { headers, user: undefined as any };
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

describe('ApiKeyGuard', () => {
  const validKey = 'my-valid-api-key';
  const authOptions: AuthOptions = {
    apiKey: {
      enabled: true,
      validate: async (key: string) => key === validKey,
    },
  };

  it('passes with valid API key', async () => {
    const { context, reflector } = createMockContext({ 'x-api-key': validKey });
    const guard = new ApiKeyGuard(reflector, authOptions);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks with invalid key', async () => {
    const { context, reflector } = createMockContext({ 'x-api-key': 'wrong-key' });
    const guard = new ApiKeyGuard(reflector, authOptions);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('respects @Public()', async () => {
    const { context, reflector } = createMockContext({}, { [IS_PUBLIC_KEY]: true });
    const guard = new ApiKeyGuard(reflector, authOptions);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
