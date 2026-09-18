import { describe, it, expect, vi } from 'vitest';
import { DeliveryRateLimitGuard } from '../../src/content/guards/delivery-rate-limit.guard';

describe('DeliveryRateLimitGuard', () => {
  function createGuard(max = 5, windowMs = 60000) {
    return new DeliveryRateLimitGuard({ rateLimitMax: max, rateLimitWindowMs: windowMs } as any);
  }

  function createMockContext(apiKey = 'test-key') {
    const response = { setHeader: vi.fn() };
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-api-key': apiKey }, ip: '127.0.0.1' }),
        getResponse: () => response,
      }),
    } as any;
  }

  it('should allow requests within limit', () => {
    const guard = createGuard(5);
    const ctx = createMockContext();

    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('should reject requests over limit', () => {
    const guard = createGuard(3);
    const ctx = createMockContext();

    guard.canActivate(ctx); // 1
    guard.canActivate(ctx); // 2
    guard.canActivate(ctx); // 3

    expect(() => guard.canActivate(ctx)).toThrow('Too many requests');
  });

  it('should track per API key', () => {
    const guard = createGuard(2);
    const ctx1 = createMockContext('key-a');
    const ctx2 = createMockContext('key-b');

    guard.canActivate(ctx1); // key-a: 1
    guard.canActivate(ctx1); // key-a: 2
    expect(() => guard.canActivate(ctx1)).toThrow(); // key-a: 3 → reject

    // key-b should still work
    expect(guard.canActivate(ctx2)).toBe(true);
  });

  it('should set rate limit headers', () => {
    const guard = createGuard(10);
    const ctx = createMockContext();
    const response = ctx.switchToHttp().getResponse();

    guard.canActivate(ctx);

    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 9);
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
  });

  it('should use default values', () => {
    const guard = new DeliveryRateLimitGuard({} as any);
    const ctx = createMockContext();

    // Default is 100 req/min — should not throw
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
