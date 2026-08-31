/**
 * Context provided to policy evaluation.
 * Contains all information needed to make an authorization decision.
 */
export interface AuthorizationContext {
  /** The authenticated user */
  user: {
    id: string;
    roles?: string[];
    permissions?: string[];
    organizationId?: string;
    departmentId?: string;
    teamId?: string;
    [key: string]: any;
  };
  /** The action being performed (e.g. 'user.read', 'task.assign') */
  action: string;
  /** The resource type (e.g. 'user', 'task', 'report') */
  resource?: string;
  /** The specific resource ID */
  resourceId?: string;
  /** Organization context */
  organizationId?: string;
  /** Department context */
  departmentId?: string;
  /** Team context */
  teamId?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Structured authorization result with audit-friendly details.
 */
export interface AuthorizationResult {
  /** Whether access is granted */
  allowed: boolean;
  /** Human-readable reason for the decision */
  reason?: string;
  /** The permission that matched (or was missing) */
  matchedPermission?: string;
  /** The scope that was applied */
  scope?: string;
  /** The policy that made the decision */
  policy?: string;
}

/**
 * A policy evaluates whether an action is allowed given a context.
 * Policies are registered by name and invoked by @CheckPolicy().
 */
export interface AuthorizationPolicy {
  /** Unique policy name */
  readonly name: string;
  /** Evaluate the policy. Return AuthorizationResult. */
  evaluate(context: AuthorizationContext): Promise<AuthorizationResult>;
}

export interface PolicyModuleOptions {
  /** Registered policies */
  policies?: AuthorizationPolicy[];
  /** Function to build AuthorizationContext from request + metadata */
  buildContext?: (request: any, metadata?: Record<string, any>) => AuthorizationContext | Promise<AuthorizationContext>;
  /** Default to deny if no policy matches. Default: true */
  denyByDefault?: boolean;
}
