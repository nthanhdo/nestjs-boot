import { describe, it, expect, vi } from 'vitest';
import { MemorySessionStore } from '../../src/auth/session';
import { SessionGuard } from '../../src/auth/session/session.guard';
import { Reflector } from '@nestjs/core';

describe('MemorySessionStore', () => {
  it('should set and get a session', async () => {
    const store = new MemorySessionStore();
    await store.set('sid1', { userId: 'u1' });

    const data = await store.get('sid1');
    expect(data).toEqual({ userId: 'u1' });
  });

  it('should return null for expired sessions', async () => {
    const store = new MemorySessionStore();
    await store.set('sid2', { userId: 'u2' }, 1); // 1ms TTL

    await new Promise((r) => setTimeout(r, 10));
    const data = await store.get('sid2');
    expect(data).toBeNull();
  });

  it('should destroy a session', async () => {
    const store = new MemorySessionStore();
    await store.set('sid3', { userId: 'u3' });
    await store.destroy('sid3');

    const data = await store.get('sid3');
    expect(data).toBeNull();
  });

  it('should touch (extend) a session', async () => {
    const store = new MemorySessionStore();
    await store.set('sid4', { userId: 'u4' }, 50);
    await store.touch('sid4', 100000);

    // Session should still exist after a short delay
    await new Promise((r) => setTimeout(r, 60));
    const data = await store.get('sid4');
    expect(data).toEqual({ userId: 'u4' });
  });
});

describe('SessionGuard', () => {
  it('should skip auth for @Public() routes', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true as any);

    const guard = new SessionGuard(reflector, {
      secret: 'test',
      store: new MemorySessionStore(),
    });

    const context = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    expect(await guard.canActivate(context)).toBe(true);
  });
});
