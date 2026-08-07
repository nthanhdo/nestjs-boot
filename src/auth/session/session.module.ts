import { DynamicModule, Module, Provider } from '@nestjs/common';
import { SESSION_OPTIONS } from './session.constants';
import { SessionModuleOptions } from './session.interfaces';
import { SessionGuard } from './session.guard';
import { MemorySessionStore } from './memory-session.store';

/**
 * SessionAuthModule — session-based authentication.
 *
 * Store-agnostic via SessionStore interface. Default = MemorySessionStore (dev only).
 *
 * ```ts
 * SessionAuthModule.register({
 *   secret: 'session-signing-secret',
 *   store: new RedisSessionStore(redisClient), // user provides
 *   maxAge: 3600000, // 1h
 * })
 * ```
 */
@Module({})
export class SessionAuthModule {
  static register(options: SessionModuleOptions): DynamicModule {
    const resolvedOptions: SessionModuleOptions = {
      ...options,
      store: options.store ?? new MemorySessionStore(),
      cookieName: options.cookieName ?? 'boot.sid',
      maxAge: options.maxAge ?? 86400000,
      httpOnly: options.httpOnly ?? true,
      secure: options.secure ?? false,
      sameSite: options.sameSite ?? 'lax',
    };

    const providers: Provider[] = [
      {
        provide: SESSION_OPTIONS,
        useValue: resolvedOptions,
      },
      SessionGuard,
    ];

    return {
      module: SessionAuthModule,
      providers,
      exports: [SESSION_OPTIONS, SessionGuard],
    };
  }
}
