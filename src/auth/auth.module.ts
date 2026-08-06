import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUTH_OPTIONS } from './constants';
import { AuthOptions } from './interfaces';
import { BootJwtService } from './services/jwt.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';

/**
 * AuthModule — composable, opt-in auth + RBAC.
 *
 * Usage:
 * ```ts
 * AuthModule.register({
 *   jwt: { secret: 'my-secret', signOptions: { expiresIn: '1h' } },
 *   rbac: { enabled: true },
 * })
 * ```
 *
 * Only the configured guards are activated. No forced user model.
 */
@Global()
@Module({})
export class AuthModule {
  static register(options: AuthOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: AUTH_OPTIONS,
        useValue: options,
      },
    ];
    const exports: (string | symbol | Function)[] = [AUTH_OPTIONS];

    // JWT auth
    if (options.jwt) {
      providers.push(BootJwtService);
      providers.push({
        provide: APP_GUARD,
        useClass: JwtAuthGuard,
      });
      exports.push(BootJwtService);
    }

    // API key auth
    if (options.apiKey?.enabled) {
      providers.push({
        provide: APP_GUARD,
        useClass: ApiKeyGuard,
      });
    }

    // RBAC guards
    if (options.rbac?.enabled) {
      providers.push({
        provide: APP_GUARD,
        useClass: RolesGuard,
      });
      providers.push({
        provide: APP_GUARD,
        useClass: PermissionsGuard,
      });
    }

    return {
      module: AuthModule,
      global: true,
      providers,
      exports,
    };
  }
}
