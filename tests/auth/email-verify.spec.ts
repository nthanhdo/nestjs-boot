import { describe, it, expect } from 'vitest';
import { BootJwtService } from '../../src/auth/services/jwt.service';

describe('Email Verification Tokens', () => {
  const secret = 'email-verify-test-secret';
  const service = new BootJwtService({ jwt: { secret } } as any);

  it('should sign and verify an email verification token', () => {
    const token = service.signEmailVerification('user@example.com');
    const result = service.verifyEmailVerification(token);

    expect(result.email).toBe('user@example.com');
    expect(result.purpose).toBe('email-verification');
  });

  it('should reject an access token used as email verification', () => {
    const accessToken = service.sign({ email: 'user@example.com' });
    expect(() => service.verifyEmailVerification(accessToken)).toThrow('Invalid token purpose');
  });

  it('should support custom expiration', () => {
    const token = service.signEmailVerification('other@example.com', { expiresIn: '1h' });
    const result = service.verifyEmailVerification(token);
    expect(result.email).toBe('other@example.com');
  });
});
