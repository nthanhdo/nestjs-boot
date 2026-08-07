import { describe, it, expect } from 'vitest';
import * as jwt from 'jsonwebtoken';
import {
  createTestJwt,
  createTestApiKey,
  createAuthenticatedRequest,
  MockAuthModule,
  TEST_SECRET,
} from '../../src/testing/auth';

describe('Auth Testing Helpers', () => {
  it('createTestJwt should produce a valid JWT with default secret', () => {
    const token = createTestJwt({ sub: 'user-1', role: 'admin' });
    const decoded = jwt.verify(token, TEST_SECRET) as any;

    expect(decoded.sub).toBe('user-1');
    expect(decoded.role).toBe('admin');
  });

  it('createTestJwt should accept custom secret and expiry', () => {
    const customSecret = 'my-custom-secret';
    const token = createTestJwt({ sub: 'user-2' }, { secret: customSecret, expiresIn: '5m' });
    const decoded = jwt.verify(token, customSecret) as any;

    expect(decoded.sub).toBe('user-2');
    expect(decoded.exp).toBeDefined();
  });

  it('createTestApiKey should return deterministic keys', () => {
    const key1 = createTestApiKey(['read', 'write']);
    const key2 = createTestApiKey(['read', 'write']);
    const key3 = createTestApiKey();

    expect(key1).toBe(key2); // Same permissions = same key
    expect(key3).toContain('default');
    expect(key1).not.toBe(key3);
  });

  it('createAuthenticatedRequest should produce a request with Bearer header', () => {
    const req = createAuthenticatedRequest({ sub: 'user-3', email: 'test@example.com' });

    expect(req.headers.authorization).toMatch(/^Bearer /);
    const token = req.headers.authorization.slice(7);
    const decoded = jwt.verify(token, TEST_SECRET) as any;
    expect(decoded.sub).toBe('user-3');
  });

  it('MockAuthModule.register should return a DynamicModule', () => {
    const mod = MockAuthModule.register({ sub: 'mock-user' });

    expect(mod.module).toBe(MockAuthModule);
    expect(mod.global).toBe(true);
    expect(mod.providers).toBeDefined();
  });
});
