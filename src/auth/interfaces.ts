export interface JwtAuthOptions {
  secret: string;
  signOptions?: { expiresIn?: string | number; algorithm?: string };
  refreshSecret?: string;
  refreshExpiresIn?: string | number;
  /** Optional token revocation check. Called after JWT verify succeeds. */
  isRevoked?: (payload: any) => Promise<boolean>;
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
}

export interface AuthOptions {
  jwt?: JwtAuthOptions;
  apiKey?: ApiKeyAuthOptions;
  rbac?: RbacOptions;
}
