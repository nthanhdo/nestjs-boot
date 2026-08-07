import { describe, it, expect } from 'vitest';
import { BootJwtService } from '../../src/auth/services/jwt.service';

describe('Password Reset Tokens', () => {
  const secret = 'pw-reset-test-secret';
  const service = new BootJwtService({ jwt: { secret } } as any);

  it('should sign and verify a password reset token', () => {
    const token = service.signPasswordReset('user-123');
    const result = service.verifyPasswordReset(token);

    expect(result.sub).toBe('user-123');
    expect(result.purpose).toBe('password-reset');
  });

  it('should reject an access token used as password reset', () => {
    const accessToken = service.sign({ sub: 'user-123' });
    expect(() => service.verifyPasswordReset(accessToken)).toThrow('Invalid token purpose');
  });

  it('should support custom expiration', () => {
    const token = service.signPasswordReset('user-456', { expiresIn: '5m' });
    const result = service.verifyPasswordReset(token);
    expect(result.sub).toBe('user-456');
  });
});
