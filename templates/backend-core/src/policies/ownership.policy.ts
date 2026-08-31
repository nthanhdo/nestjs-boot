import type {
  AuthorizationPolicy,
  AuthorizationContext,
  AuthorizationResult,
} from 'nestjs-boot';

/**
 * OwnershipPolicy — allows access when the authenticated user owns the resource.
 *
 * Requires `context.metadata.ownerId` to be set. When absent the policy
 * returns `allowed: true` so other policies in the chain can decide.
 */
export class OwnershipPolicy implements AuthorizationPolicy {
  readonly name = 'ownership';

  async evaluate(context: AuthorizationContext): Promise<AuthorizationResult> {
    // If resource has no owner concept, allow (delegate to other policies)
    if (!context.resourceId || !context.metadata?.ownerId) {
      return { allowed: true, reason: 'No ownership context', policy: this.name };
    }

    const isOwner = context.user.id === context.metadata.ownerId;
    return {
      allowed: isOwner,
      reason: isOwner ? 'User is resource owner' : 'User is not the resource owner',
      policy: this.name,
    };
  }
}
