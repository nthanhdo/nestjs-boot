import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, IS_PUBLIC_KEY } from '../constants';
import type { AuthOptions } from '../interfaces';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';

/**
 * AuthStrategyGuard — composite guard that runs JWT OR ApiKey logic.
 *
 * When both JWT and ApiKey are configured, the default APP_GUARD registration
 * runs them as AND (both must pass). This guard instead tries JWT first;
 * if JWT fails and ApiKey is configured, it falls back to ApiKey.
 *
 * Usage: Register this as APP_GUARD instead of JwtAuthGuard + ApiKeyGuard individually.
 */
@Injectable()
export class AuthStrategyGuard implements CanActivate {
  private readonly jwtGuard: JwtAuthGuard;
  private readonly apiKeyGuard: ApiKeyGuard | null;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) authOptions: AuthOptions,
  ) {
    this.jwtGuard = new JwtAuthGuard(reflector, authOptions);
    this.apiKeyGuard = authOptions.apiKey?.enabled
      ? new ApiKeyGuard(reflector, authOptions)
      : null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Try JWT first
    try {
      return await this.jwtGuard.canActivate(context);
    } catch (jwtError) {
      // If ApiKey is configured, try it as fallback
      if (this.apiKeyGuard) {
        try {
          return await this.apiKeyGuard.canActivate(context);
        } catch {
          // Both failed — throw the original JWT error
          throw jwtError;
        }
      }
      throw jwtError;
    }
  }
}
