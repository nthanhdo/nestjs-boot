import { describe, it, expect } from 'vitest';
import * as jwt from 'jsonwebtoken';
import { BootJwtService } from '../../src/auth/services/jwt.service';
import { AuthOptions } from '../../src/auth/interfaces';

function createService(opts: Partial<AuthOptions['jwt']> & { secret: string }): BootJwtService {
  const authOptions: AuthOptions = {
    jwt: {
      secret: opts.secret,
      signOptions: opts.signOptions,
      refreshSecret: opts.refreshSecret,
      refreshExpiresIn: opts.refreshExpiresIn,
    },
  };
  // Bypass DI — construct directly with injected options
  return new BootJwtService(authOptions);
}

describe('BootJwtService', () => {
  const secret = 'test-secret-key-min8';
  const refreshSecret = 'refresh-secret-key-min8';

  it('sign creates a valid JWT', () => {
    const service = createService({ secret });
    const token = service.sign({ sub: '123', role: 'admin' });
    expect(typeof token).toBe('string');
    const decoded = jwt.verify(token, secret) as Record<string, any>;
    expect(decoded.sub).toBe('123');
    expect(decoded.role).toBe('admin');
  });

  it('verify decodes correctly', () => {
    const service = createService({ secret });
    const token = service.sign({ userId: 42 });
    const result = service.verify(token);
    expect(result.userId).toBe(42);
  });

  it('verify throws on invalid token', () => {
    const service = createService({ secret });
    expect(() => service.verify('invalid.token.here')).toThrow();
  });

  it('refresh token uses separate secret', () => {
    const service = createService({ secret, refreshSecret });
    const token = service.signRefresh({ sub: '456' });
    // Verify with refresh secret works
    const decoded = service.verifyRefresh(token);
    expect(decoded.sub).toBe('456');
    // Verify with main secret should fail
    expect(() => jwt.verify(token, secret)).toThrow();
  });
});
