import type {
  AuthorizationPolicy,
  AuthorizationContext,
  AuthorizationResult,
} from 'nestjs-boot';

/**
 * OrgBoundaryPolicy — allows access only when the authenticated user
 * belongs to the same organization as the resource.
 *
 * Requires `context.metadata.resourceOrganizationId` to be set.
 * When absent the policy returns `allowed: true` so other policies decide.
 */
export class OrgBoundaryPolicy implements AuthorizationPolicy {
  readonly name = 'orgBoundary';

  async evaluate(context: AuthorizationContext): Promise<AuthorizationResult> {
    if (!context.metadata?.resourceOrganizationId) {
      return { allowed: true, reason: 'No org context', policy: this.name };
    }

    const sameOrg = context.user.organizationId === context.metadata.resourceOrganizationId;
    return {
      allowed: sameOrg,
      reason: sameOrg ? 'Same organization' : 'Cross-organization access denied',
      policy: this.name,
      scope: 'ORGANIZATION',
    };
  }
}
