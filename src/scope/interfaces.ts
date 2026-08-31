/**
 * Access scopes — from most restrictive to least.
 * Each scope defines the boundary of data a user can access.
 */
export enum AccessScope {
  /** Only resources owned by the current user */
  OWN = 'OWN',
  /** Resources belonging to the user's team */
  TEAM = 'TEAM',
  /** Resources belonging to the user's department */
  DEPARTMENT = 'DEPARTMENT',
  /** Resources belonging to the user's organization */
  ORGANIZATION = 'ORGANIZATION',
  /** Unrestricted system-wide access */
  SYSTEM = 'SYSTEM',
}

/** Numeric scope levels for comparison (higher = broader access) */
export const SCOPE_LEVELS: Record<AccessScope, number> = {
  [AccessScope.OWN]: 10,
  [AccessScope.TEAM]: 20,
  [AccessScope.DEPARTMENT]: 30,
  [AccessScope.ORGANIZATION]: 40,
  [AccessScope.SYSTEM]: 50,
};

export interface ScopeContext {
  userId: string;
  organizationId?: string;
  departmentId?: string;
  teamId?: string;
}

export interface ScopeModuleOptions {
  /** Function to extract scope context from request */
  extractContext?: (request: any) => ScopeContext | Promise<ScopeContext>;
  /** Function to resolve the user's maximum scope */
  resolveScope?: (request: any) => AccessScope | Promise<AccessScope>;
  /** Default scope when none is configured */
  defaultScope?: AccessScope;
}

export interface ScopeCheckResult {
  allowed: boolean;
  userScope: AccessScope;
  requiredScope: AccessScope;
  context?: ScopeContext;
}
