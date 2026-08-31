export { AuthModule } from './auth.module';
export { BootJwtService } from './services/jwt.service';
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { WsJwtGuard } from './guards/ws-jwt.guard';
export { ApiKeyGuard } from './guards/api-key.guard';
export { AuthStrategyGuard } from './guards/auth-strategy.guard';
export { RolesGuard } from './guards/roles.guard';
export { PermissionsGuard } from './guards/permissions.guard';
export { Roles, Permissions, Public, CurrentUser } from './decorators';
export { AUTH_OPTIONS, ROLES_KEY, PERMISSIONS_KEY, IS_PUBLIC_KEY } from './constants';
export type { AuthOptions, JwtAuthOptions, ApiKeyAuthOptions, RbacOptions } from './interfaces';

// RBAC
export { RoleHierarchy, MemoryPermissionStore, PERMISSION_STORE, SuperAdminOnly, SUPERADMIN_ONLY_KEY, PrivilegeBoundary } from './rbac';
export type { RoleDefinition, PermissionStore, LeveledRole } from './rbac';

// Social auth
export {
  SocialAuthModule,
  GoogleStrategy,
  GitHubStrategy,
  SOCIAL_AUTH_OPTIONS,
} from './social';
export type {
  SocialProfile,
  SocialAuthOptions,
  SocialProviderConfig,
  SocialStrategyOptions,
} from './social';

// TOTP / 2FA
export { TotpModule, TotpService } from './totp';

// Session auth
export {
  SessionAuthModule,
  SessionGuard,
  Session,
  MemorySessionStore,
  RedisSessionStore,
  SESSION_OPTIONS,
} from './session';
export type { SessionStore, SessionData, SessionModuleOptions } from './session';

// Token store (refresh token family tracking)
export { TOKEN_STORE, MemoryTokenStore, RedisTokenStore } from './token';
export type { TokenStore } from './token';

// Login attempt tracker
export { LoginTracker, LOGIN_TRACKER_OPTIONS } from './login-tracker';
export type { LoginTrackerOptions } from './login-tracker';

// Break-glass emergency access
export { BreakGlass, BREAK_GLASS_KEY, BreakGlassGuard, BreakGlassModule } from './break-glass';
