import { Injectable, Inject, Optional } from '@nestjs/common';
import { SCOPE_OPTIONS } from './constants';
import { AccessScope, SCOPE_LEVELS, ScopeContext, ScopeModuleOptions } from './interfaces';

/**
 * ScopeResolver — determines the user's effective scope and checks access.
 */
@Injectable()
export class ScopeResolver {
  constructor(
    @Optional() @Inject(SCOPE_OPTIONS) private readonly options?: ScopeModuleOptions,
  ) {}

  /** Extract scope context from request */
  async extractContext(request: any): Promise<ScopeContext> {
    if (this.options?.extractContext) {
      return this.options.extractContext(request);
    }
    // Default: read from request.user
    const user = request.user;
    return {
      userId: user?.sub ?? user?.id ?? '',
      organizationId: user?.organizationId,
      departmentId: user?.departmentId,
      teamId: user?.teamId,
    };
  }

  /** Resolve the user's maximum access scope */
  async resolveScope(request: any): Promise<AccessScope> {
    if (this.options?.resolveScope) {
      return this.options.resolveScope(request);
    }
    // Default: read from request.user.scope
    const scope = request.user?.scope;
    if (scope && Object.values(AccessScope).includes(scope)) {
      return scope as AccessScope;
    }
    return this.options?.defaultScope ?? AccessScope.OWN;
  }

  /** Check if user's scope meets the required scope */
  isScopeSufficient(userScope: AccessScope, requiredScope: AccessScope): boolean {
    return SCOPE_LEVELS[userScope] >= SCOPE_LEVELS[requiredScope];
  }

  /** Build a filter object based on scope (for query building) */
  buildScopeFilter(scope: AccessScope, context: ScopeContext): Record<string, any> {
    switch (scope) {
      case AccessScope.OWN:
        return { ownerId: context.userId };
      case AccessScope.TEAM:
        return context.teamId ? { teamId: context.teamId } : { ownerId: context.userId };
      case AccessScope.DEPARTMENT:
        return context.departmentId ? { departmentId: context.departmentId } : { ownerId: context.userId };
      case AccessScope.ORGANIZATION:
        return context.organizationId ? { organizationId: context.organizationId } : { ownerId: context.userId };
      case AccessScope.SYSTEM:
        return {}; // No filter — full access
    }
  }
}
