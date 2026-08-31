import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPE_KEY } from './constants';
import { AccessScope } from './interfaces';
import { ScopeResolver } from './scope.resolver';
import { IS_PUBLIC_KEY } from '../auth/constants';

/**
 * ScopeGuard — checks if user's resolved scope meets the required scope level.
 * Used with @RequireScope() decorator.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly scopeResolver: ScopeResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Respect @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    let requiredScope = this.reflector.getAllAndOverride<AccessScope>(SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredScope) {
      // Default to OWN scope for authenticated routes (least privilege)
      requiredScope = AccessScope.OWN;
    }

    const request = context.switchToHttp().getRequest();
    const userScope = await this.scopeResolver.resolveScope(request);

    if (!this.scopeResolver.isScopeSufficient(userScope, requiredScope)) {
      throw new ForbiddenException(
        `Insufficient scope: requires ${requiredScope}, user has ${userScope}`,
      );
    }

    return true;
  }
}
