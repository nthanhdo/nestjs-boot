import type {
  AuthorizationPolicy,
  AuthorizationContext,
  AuthorizationResult,
} from 'nestjs-boot';

/**
 * DepartmentAccessPolicy — allows access only when the authenticated user
 * belongs to the same department as the resource.
 *
 * Requires `context.metadata.resourceDepartmentId` to be set.
 * When absent the policy returns `allowed: true` so other policies decide.
 */
export class DepartmentAccessPolicy implements AuthorizationPolicy {
  readonly name = 'departmentAccess';

  async evaluate(context: AuthorizationContext): Promise<AuthorizationResult> {
    if (!context.metadata?.resourceDepartmentId) {
      return { allowed: true, reason: 'No department context', policy: this.name };
    }

    const sameDept = context.user.departmentId === context.metadata.resourceDepartmentId;
    return {
      allowed: sameDept,
      reason: sameDept ? 'Same department' : 'Cross-department access denied',
      policy: this.name,
      scope: 'DEPARTMENT',
    };
  }
}
