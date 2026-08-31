export interface JwtAuthOptions {
  secret: string;
  signOptions?: { expiresIn?: string | number; algorithm?: string };
  refreshSecret?: string;
  refreshExpiresIn?: string | number;
  /** Separate secret for password-reset / email-verification tokens. Defaults to main secret. */
  resetSecret?: string;
  /** Optional token revocation check. Called after JWT verify succeeds. */
  isRevoked?: (payload: any) => Promise<boolean>;
  /** Token store for refresh token family tracking and reuse detection */
  tokenStore?: import('./token/token-store.interface').TokenStore;
}

export interface ApiKeyAuthOptions {
  /** Enable API key auth. Keys validated via user-provided validator function */
  enabled: boolean;
  /** Header name (default: 'x-api-key') */
  headerName?: string;
  /** User provides this function to validate API keys. Return truthy for valid */
  validate: (apiKey: string) => Promise<boolean | { valid: boolean; permissions?: string[] }>;
}

export interface RbacOptions {
  /** Enable RBAC guards */
  enabled: boolean;
  /** Function to extract roles from request (e.g., from JWT payload) */
  extractRoles?: (request: any) => string[];
  /** Function to extract permissions from request */
  extractPermissions?: (request: any) => string[];
  /** Role hierarchy definitions. If provided, role checks include inherited roles. */
  hierarchy?: import('./rbac/role-hierarchy').RoleDefinition[];
  /** Super-admin role name. Users with this role bypass all role/permission checks. */
  superAdmin?: string;
  /** Permission store for DB-backed permissions. If provided, permissions are loaded from store instead of JWT. */
  permissionStore?: import('./rbac/permission-store').PermissionStore;
  /**
   * Deny-by-default mode. When true, routes with NO @Roles() / @Permissions() decorator
   * are denied (ForbiddenException) instead of passing through.
   * Routes decorated with @Public() are still allowed.
   */
  denyByDefault?: boolean;
}

export interface AuthOptions {
  jwt?: JwtAuthOptions;
  apiKey?: ApiKeyAuthOptions;
  rbac?: RbacOptions;
  /** Login attempt tracking options — enables in-memory brute-force protection */
  loginTracker?: import('./login-tracker/login-tracker').LoginTrackerOptions;
}
