import { DynamicModule, Module, Provider } from '@nestjs/common';

/**
 * Profile returned by any social login strategy.
 * No user model — caller decides what to do with this data.
 */
export interface SocialProfile {
  provider: string;
  providerId: string;
  email?: string;
  name?: string;
  avatar?: string;
  raw: Record<string, any>;
}

export interface SocialStrategyOptions {
  name: string;
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  scope?: string[];
}

export interface SocialAuthOptions {
  providers: SocialProviderConfig[];
  /**
   * Called when a social profile is received. Caller decides:
   * create user? link account? reject?
   */
  onProfile: (profile: SocialProfile) => Promise<any>;
}

export interface SocialProviderConfig {
  strategy: 'google' | 'github';
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  scope?: string[];
}

export const SOCIAL_AUTH_OPTIONS = 'BOOT_SOCIAL_AUTH_OPTIONS';

/**
 * GoogleStrategy — wraps passport-google-oauth20.
 * Returns SocialProfile, no user model.
 */
export class GoogleStrategy {
  private strategy: any;

  constructor(
    private readonly config: SocialProviderConfig,
    private readonly onProfile: (profile: SocialProfile) => Promise<any>,
  ) {
    this.init();
  }

  private init(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Strategy } = require('passport-google-oauth20');
      this.strategy = new Strategy(
        {
          clientID: this.config.clientID,
          clientSecret: this.config.clientSecret,
          callbackURL: this.config.callbackURL,
          scope: this.config.scope ?? ['email', 'profile'],
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const socialProfile: SocialProfile = {
              provider: 'google',
              providerId: profile.id,
              email: profile.emails?.[0]?.value,
              name: profile.displayName,
              avatar: profile.photos?.[0]?.value,
              raw: profile._json ?? profile,
            };
            const result = await this.onProfile(socialProfile);
            done(null, result);
          } catch (err) {
            done(err);
          }
        },
      );
    } catch {
      throw new Error(
        'passport-google-oauth20 is required for GoogleStrategy. Install it: npm install passport-google-oauth20',
      );
    }
  }

  getStrategy(): any {
    return this.strategy;
  }
}

/**
 * GitHubStrategy — wraps passport-github2.
 * Returns SocialProfile, no user model.
 */
export class GitHubStrategy {
  private strategy: any;

  constructor(
    private readonly config: SocialProviderConfig,
    private readonly onProfile: (profile: SocialProfile) => Promise<any>,
  ) {
    this.init();
  }

  private init(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Strategy } = require('passport-github2');
      this.strategy = new Strategy(
        {
          clientID: this.config.clientID,
          clientSecret: this.config.clientSecret,
          callbackURL: this.config.callbackURL,
          scope: this.config.scope ?? ['user:email'],
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const socialProfile: SocialProfile = {
              provider: 'github',
              providerId: String(profile.id),
              email: profile.emails?.[0]?.value,
              name: profile.displayName ?? profile.username,
              avatar: profile.photos?.[0]?.value,
              raw: profile._json ?? profile,
            };
            const result = await this.onProfile(socialProfile);
            done(null, result);
          } catch (err) {
            done(err);
          }
        },
      );
    } catch {
      throw new Error(
        'passport-github2 is required for GitHubStrategy. Install it: npm install passport-github2',
      );
    }
  }

  getStrategy(): any {
    return this.strategy;
  }
}

/**
 * SocialAuthModule — wraps social login strategies.
 *
 * NO forced user model, NO forced routes.
 * Strategy returns SocialProfile, caller decides what to do.
 *
 * ```ts
 * SocialAuthModule.register({
 *   providers: [
 *     { strategy: 'google', clientID: '...', clientSecret: '...', callbackURL: '/auth/google/callback' },
 *   ],
 *   onProfile: async (profile) => {
 *     // create or find user, return whatever you want
 *     return userService.findOrCreate(profile);
 *   },
 * })
 * ```
 */
@Module({})
export class SocialAuthModule {
  static register(options: SocialAuthOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: SOCIAL_AUTH_OPTIONS,
        useValue: options,
      },
    ];

    // Initialize passport strategies
    for (const providerConfig of options.providers) {
      const strategyToken = `SOCIAL_STRATEGY_${providerConfig.strategy.toUpperCase()}`;

      if (providerConfig.strategy === 'google') {
        providers.push({
          provide: strategyToken,
          useFactory: () => new GoogleStrategy(providerConfig, options.onProfile),
        });
      } else if (providerConfig.strategy === 'github') {
        providers.push({
          provide: strategyToken,
          useFactory: () => new GitHubStrategy(providerConfig, options.onProfile),
        });
      }
    }

    return {
      module: SocialAuthModule,
      providers,
      exports: [SOCIAL_AUTH_OPTIONS, ...providers.map((p: any) => p.provide).filter(Boolean)],
    };
  }
}
