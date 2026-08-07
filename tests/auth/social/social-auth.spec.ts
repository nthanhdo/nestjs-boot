import { describe, it, expect, vi } from 'vitest';
import { SocialAuthModule, GoogleStrategy, SocialProfile } from '../../../src/auth/social';

describe('SocialAuthModule', () => {
  it('should register with provider configs', () => {
    const onProfile = vi.fn();
    const result = SocialAuthModule.register({
      providers: [],
      onProfile,
    });

    expect(result.module).toBe(SocialAuthModule);
    expect(result.providers).toBeDefined();
  });

  it('should export SOCIAL_AUTH_OPTIONS', () => {
    const result = SocialAuthModule.register({
      providers: [],
      onProfile: async () => ({}),
    });

    expect(result.exports).toBeDefined();
    expect(result.exports).toContain('BOOT_SOCIAL_AUTH_OPTIONS');
  });

  it('should define SocialProfile interface correctly', () => {
    const profile: SocialProfile = {
      provider: 'google',
      providerId: '12345',
      email: 'test@example.com',
      name: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
      raw: { id: '12345' },
    };

    expect(profile.provider).toBe('google');
    expect(profile.providerId).toBe('12345');
    expect(profile.email).toBe('test@example.com');
  });

  it('should throw when passport-google-oauth20 is not installed', () => {
    expect(() => {
      new GoogleStrategy(
        {
          strategy: 'google' as const,
          clientID: 'test',
          clientSecret: 'test',
          callbackURL: '/cb',
        },
        async () => ({}),
      );
    }).toThrow('passport-google-oauth20 is required');
  });
});
