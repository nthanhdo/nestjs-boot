import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsJwtGuard } from '../../src/auth/guards/ws-jwt.guard';
import { Reflector } from '@nestjs/core';
import { BootJwtService } from '../../src/auth/services/jwt.service';

function createMockContext(client: any, isPublic = false) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic as any);

  return {
    reflector,
    context: {
      switchToWs: () => ({ getClient: () => client }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any,
  };
}

describe('WsJwtGuard', () => {
  const secret = 'ws-test-secret';
  let jwtService: BootJwtService;

  beforeEach(() => {
    jwtService = new BootJwtService({ jwt: { secret } } as any);
  });

  it('should authenticate via handshake.auth.token', async () => {
    const token = jwtService.sign({ sub: 'user1' });
    const client = { handshake: { auth: { token } }, data: {} };
    const { reflector, context } = createMockContext(client);

    const guard = new WsJwtGuard(reflector, { jwt: { secret } }, jwtService);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(client.data.user).toBeDefined();
    expect(client.data.user.sub).toBe('user1');
  });

  it('should authenticate via handshake.headers.authorization', async () => {
    const token = jwtService.sign({ sub: 'user2' });
    const client = {
      handshake: { headers: { authorization: `Bearer ${token}` }, auth: {} },
      data: {},
    };
    const { reflector, context } = createMockContext(client);

    const guard = new WsJwtGuard(reflector, { jwt: { secret } }, jwtService);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(client.data.user.sub).toBe('user2');
  });

  it('should skip auth for @Public() routes', async () => {
    const client = { handshake: { auth: {} }, data: {} };
    const { reflector, context } = createMockContext(client, true);

    const guard = new WsJwtGuard(reflector, { jwt: { secret } }, jwtService);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });
});
