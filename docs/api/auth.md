# Auth API Reference

> Composable, opt-in authentication and RBAC — JWT, API key, roles, permissions, role hierarchy, super-admin, DB-backed permission store, sessions, TOTP, and social login. No forced user model.

## Module Registration

### `AuthModule`

```ts
AuthModule.register(options: AuthOptions): DynamicModule
```

`AuthModule` is `global: true`. Only the guards for configured strategies are activated.

```ts
import { AuthModule } from 'nestjs-boot';

AuthModule.register({
  jwt: {
    secret: 'my-32-char-minimum-secret-here!!',
    signOptions: { expiresIn: '1h' },
    refreshSecret: 'another-32-char-refresh-secret!!',
    refreshExpiresIn: '7d',
  },
  apiKey: {
    enabled: true,
    headerName: 'x-api-key',
    validate: async (key) => myDb.findApiKey(key) !== null,
  },
  rbac: {
    enabled: true,
    superAdmin: 'superadmin',
    hierarchy: [
      { name: 'superadmin', inherits: ['admin'] },
      { name: 'admin', inherits: ['manager'], permissions: ['user:delete', 'user:ban'] },
      { name: 'manager', inherits: ['user'], permissions: ['user:edit', 'content:moderate'] },
      { name: 'user', permissions: ['user:read', 'content:read'] },
    ],
  },
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `jwt` | `JwtAuthOptions` | — | Enable JWT authentication |
| `jwt.secret` | `string` | — | **Required.** HMAC-SHA256 secret (min 32 chars) |
| `jwt.signOptions.expiresIn` | `string \| number` | — | Access token expiry (e.g. `'1h'`, `3600`) |
| `jwt.signOptions.algorithm` | `string` | `'HS256'` | JWT algorithm |
| `jwt.refreshSecret` | `string` | `jwt.secret` | Separate secret for refresh tokens |
| `jwt.refreshExpiresIn` | `string \| number` | — | Refresh token expiry |
| `jwt.resetSecret` | `string` | `jwt.secret` | Separate secret for password-reset/email-verify tokens |
| `jwt.isRevoked` | `(payload) => Promise<boolean>` | — | Optional token revocation check, called after verify |
| `apiKey` | `ApiKeyAuthOptions` | — | Enable API key authentication |
| `apiKey.enabled` | `boolean` | — | **Required when `apiKey` is set** |
| `apiKey.headerName` | `string` | `'x-api-key'` | Header name to read the API key from |
| `apiKey.validate` | `(key) => Promise<boolean \| { valid; permissions? }>` | — | **Required.** Caller-provided key validator |
| `rbac` | `RbacOptions` | — | Enable role/permission guards |
| `rbac.enabled` | `boolean` | — | **Required when `rbac` is set** |
| `rbac.extractRoles` | `(req) => string[]` | `req.user?.roles ?? []` | Extract roles from the request |
| `rbac.extractPermissions` | `(req) => string[]` | `req.user?.permissions ?? []` | Extract permissions from the request |
| `rbac.hierarchy` | `RoleDefinition[]` | — | Role hierarchy definitions. Enables role inheritance |
| `rbac.superAdmin` | `string` | — | Super-admin role name. Bypasses all role/permission checks |
| `rbac.permissionStore` | `PermissionStore` | — | DB-backed permission store. Enables async permission loading |

When `hierarchy` is provided, `RoleHierarchy` is registered as a provider and exported. When `permissionStore` is provided, it is registered under the `PERMISSION_STORE` token.

---

### `SessionAuthModule`

```ts
SessionAuthModule.register(options: SessionModuleOptions): DynamicModule
```

Session-based authentication. Store-agnostic — plug in any `SessionStore` implementation. Defaults to `MemorySessionStore` (development only).

```ts
SessionAuthModule.register({
  secret: 'session-signing-secret',
  store: new RedisSessionStore(redisClient),
  maxAge: 3_600_000,
  cookieName: 'boot.sid',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
})
```

#### Session Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | — | **Required.** Secret for HMAC-SHA256 cookie signing |
| `store` | `SessionStore` | `MemorySessionStore` | Session storage backend |
| `cookieName` | `string` | `'boot.sid'` | Cookie name |
| `maxAge` | `number` | `86400000` | Session TTL in milliseconds (24h) |
| `httpOnly` | `boolean` | `true` | HttpOnly cookie flag |
| `secure` | `boolean` | `false` | Secure cookie flag — set `true` in production |
| `sameSite` | `'strict' \| 'lax' \| 'none'` | `'lax'` | SameSite cookie attribute |

---

### `TotpModule`

```ts
@Module({ imports: [TotpModule] })
export class AuthModule {}
```

Provides `TotpService`. No storage — the caller stores the TOTP secret in their user model.

---

### `SocialAuthModule`

```ts
SocialAuthModule.register(options: SocialAuthOptions): DynamicModule
```

Wraps Passport social strategies (Google OAuth2, GitHub). No forced user model — the `onProfile` callback receives a `SocialProfile` and the caller decides what to do.

```ts
SocialAuthModule.register({
  providers: [
    {
      strategy: 'google',
      clientID: 'GOOGLE_CLIENT_ID',
      clientSecret: 'GOOGLE_CLIENT_SECRET',
      callbackURL: '/auth/google/callback',
      scope: ['email', 'profile'],
    },
  ],
  onProfile: async (profile) => userService.findOrCreate(profile),
})
```

Requires `passport-google-oauth20` or `passport-github2` depending on the strategy used.

---

## Classes

### `BootJwtService`

> Pure JWT utility — sign, verify, rotate tokens. No user model, no sessions, no database.

Exported from `AuthModule` when `jwt` options are configured.

#### Methods

##### `sign(payload: Record<string, any>): string`

Sign an access token with the configured secret and `signOptions`.

##### `verify<T>(token: string): T`

Verify and decode an access token. Throws on invalid or expired tokens.

##### `signRefresh(payload: Record<string, any>): string`

Sign a refresh token using `refreshSecret` (falls back to main secret if not configured).

##### `verifyRefresh<T>(token: string): T`

Verify a refresh token. Throws on invalid or expired tokens.

##### `rotateRefreshToken(oldToken: string): { accessToken: string; refreshToken: string }`

Verify the old refresh token, strip JWT-specific claims (`iat`, `exp`, `nbf`, `jti`), and re-sign a new access + refresh pair. Throws if `oldToken` is invalid or expired.

##### `signPasswordReset(userId: string, options?: { expiresIn?: string }): string`

Sign a short-lived password-reset token. Default expiry: `'15m'`. Includes `purpose: 'password-reset'` claim. Uses `resetSecret`.

##### `verifyPasswordReset(token: string): { sub: string; purpose: string }`

Verify a password-reset token. Throws if invalid, expired, or `purpose` does not match `'password-reset'`.

##### `signEmailVerification(email: string, options?: { expiresIn?: string }): string`

Sign an email-verification token. Default expiry: `'24h'`. Includes `purpose: 'email-verification'` claim. Uses `resetSecret`.

##### `verifyEmailVerification(token: string): { email: string; purpose: string }`

Verify an email-verification token. Throws if invalid, expired, or `purpose` does not match `'email-verification'`.

---

### `RoleHierarchy`

> Resolves role inheritance chains and aggregates permissions across the hierarchy. Lazy-instantiated and cached by guards when `rbac.hierarchy` is configured.

#### Constructor

```ts
new RoleHierarchy(definitions?: RoleDefinition[])
```

#### Methods

##### `define(definition: RoleDefinition): void`

Register or update a role definition at runtime.

```ts
hierarchy.define({ name: 'editor', inherits: ['user'], permissions: ['content:write'] });
```

##### `resolve(role: string): string[]`

Get all effective roles for a single role, including inherited roles. Circular dependencies are safe (visited-set guard).

```ts
hierarchy.resolve('admin');
// → ['admin', 'manager', 'user']
```

##### `resolveAll(roles: string[]): string[]`

Get all effective roles for multiple user roles.

```ts
hierarchy.resolveAll(['admin', 'editor']);
// → ['admin', 'manager', 'user', 'editor']
```

##### `getPermissions(role: string): string[]`

Get all permissions for a role, including permissions inherited through the hierarchy.

```ts
hierarchy.getPermissions('admin');
// → ['user:delete', 'user:ban', 'user:edit', 'content:moderate', 'user:read', 'content:read']
```

##### `getAllPermissions(roles: string[]): string[]`

Get all permissions for multiple roles.

##### `validate(): { valid: boolean; cycles: string[][] }`

Check for circular dependencies in the hierarchy. Returns detected cycles.

```ts
const result = hierarchy.validate();
if (!result.valid) {
  console.error('Circular roles:', result.cycles);
}
```

---

### `MemoryPermissionStore`

> In-memory implementation of `PermissionStore`. For development and testing only — not for production. Use a MongoDB/Redis implementation in production.

Implements all `PermissionStore` methods using `Map<string, Set<string>>`.

#### Methods

##### `getUserPermissions(userId: string): Promise<string[]>`

Get all directly assigned permissions for a user.

##### `getUserRoles(userId: string): Promise<string[]>`

Get all directly assigned roles for a user.

##### `assignRoles(userId: string, roles: string[]): Promise<void>`

Add roles to a user. Deduplicates automatically.

##### `removeRoles(userId: string, roles: string[]): Promise<void>`

Remove roles from a user. No-op for roles the user doesn't have.

##### `assignPermissions(userId: string, permissions: string[]): Promise<void>`

Add permissions directly to a user. Deduplicates automatically.

##### `removePermissions(userId: string, permissions: string[]): Promise<void>`

Remove permissions from a user.

##### `hasPermission(userId: string, permission: string): Promise<boolean>`

Check if a user has a specific direct permission.

---

### `TotpService`

> TOTP / 2FA utilities. Uses `otpauth` library if installed; falls back to built-in HMAC-SHA1 TOTP.

#### Methods

##### `generateSecret(label: string, issuer?: string): { secret: string; otpauthUrl: string; qrDataUrl: string }`

Generate a new TOTP secret. Returns the base32 secret, the `otpauth://` URI for authenticator apps, and a QR code image URL.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `label` | `string` | — | User identifier (email or username) |
| `issuer` | `string` | `'NestJS-Boot'` | Application name shown in the authenticator app |

##### `verify(token: string, secret: string): boolean`

Verify a 6-digit TOTP token against a base32 secret. Allows ±1 time window (30s) for clock drift.

##### `generateBackupCodes(count?: number): string[]`

Generate one-time backup codes (format: `XXXX-XXXX`). Default count: `8`. The caller is responsible for storing and tracking usage.

---

## Guards

Guards are registered automatically as `APP_GUARD` when their feature is enabled in `AuthModule.register()`. All guards respect the `@Public()` decorator.

### `JwtAuthGuard`

Verifies `Authorization: Bearer <token>` header. Attaches decoded payload to `request.user`. Calls `isRevoked()` if configured.

### `ApiKeyGuard`

Reads the API key from the configured header (default `x-api-key`). Calls the user-provided `validate()` function. If `validate` returns `{ valid: true, permissions: [...] }`, attaches `permissions` to `request.user`.

### `RolesGuard`

Checks that `request.user` has **any** of the roles required by `@Roles()`. Routes without `@Roles()` pass through.

**Hierarchy support:** When `rbac.hierarchy` is configured, user roles are resolved through `RoleHierarchy.resolveAll()` before checking. The hierarchy instance is lazy-created and cached.

**Super-admin:** When `rbac.superAdmin` is set, users with that role bypass the check entirely — no `@Roles()` can block them.

```ts
// With hierarchy: admin inherits manager inherits user
// A user with role 'admin' passes @Roles('user') because admin → manager → user
@Roles('user')
@Get('profile')
getProfile() {}
```

### `PermissionsGuard`

Checks that `request.user` has **all** permissions required by `@Permissions()`. Routes without `@Permissions()` pass through.

**Permission resolution order** (all sources are merged):
1. Direct permissions from JWT/request (`extractPermissions`)
2. Role-based permissions from hierarchy (`hierarchy.getAllPermissions(userRoles)`)
3. Store-backed permissions (`permissionStore.getUserPermissions(userId)`) — async path
4. Store-backed roles → hierarchy expansion (`permissionStore.getUserRoles(userId)` → `hierarchy.getAllPermissions(storeRoles)`)

Sources 3–4 are only active when `rbac.permissionStore` is configured. The guard returns `boolean | Promise<boolean>` — sync when no store, async when store is present.

**Super-admin:** Same as `RolesGuard` — users with the `superAdmin` role bypass all permission checks.

**User ID extraction:** When using `permissionStore`, the guard reads `request.user.id ?? request.user.sub` to identify the user.

### `WsJwtGuard`

Authenticates WebSocket connections. Reads token from:
1. `client.handshake.headers.authorization` (`Bearer <token>`)
2. `client.handshake.auth.token` (Socket.IO auth object)
3. `client.upgradeReq.headers.authorization` (raw `ws`)

Attaches decoded payload to `client.data.user`.

### `SessionGuard`

Reads the session ID from the signed cookie, fetches from the configured `SessionStore`, and attaches session data to `request.session`. Extends the session TTL on each access.

---

## Decorators

### `@Roles(...roles: string[])`

Mark a route as requiring **any** of the specified roles. Works with `RolesGuard`. When hierarchy is configured, inherited roles count.

```ts
@Roles('admin', 'moderator')
@Get('dashboard')
getDashboard() {}
```

### `@Permissions(...permissions: string[])`

Mark a route as requiring **all** of the specified permissions. Works with `PermissionsGuard`. Permissions can come from JWT, hierarchy, or store.

```ts
@Permissions('product:read', 'product:write')
@Put('products/:id')
updateProduct() {}
```

### `@Public()`

Skip all auth guards on this route or controller. Applied to `JwtAuthGuard`, `ApiKeyGuard`, `RolesGuard`, `PermissionsGuard`, `WsJwtGuard`, and `SessionGuard`.

```ts
@Public()
@Get('health')
health() {}
```

### `@CurrentUser(field?: string)`

Parameter decorator. Extracts `request.user` or a specific field from it.

```ts
@Get('profile')
getProfile(@CurrentUser() user: UserPayload) {}

@Get('id')
getId(@CurrentUser('sub') userId: string) {}
```

### `@SuperAdminOnly()`

Mark a route as accessible only to the super-admin role. Sets `boot:superadminOnly` metadata.

```ts
@SuperAdminOnly()
@Delete('system/reset')
resetSystem() {}
```

### `@Session(field?: string)`

Parameter decorator. Extracts `request.session` (set by `SessionGuard`) or a specific field.

```ts
@Get('me')
getMe(@Session('userId') userId: string) {}
```

---

## Interfaces

### `AuthOptions`

```ts
interface AuthOptions {
  jwt?: JwtAuthOptions;
  apiKey?: ApiKeyAuthOptions;
  rbac?: RbacOptions;
}
```

### `JwtAuthOptions`

```ts
interface JwtAuthOptions {
  secret: string;
  signOptions?: { expiresIn?: string | number; algorithm?: string };
  refreshSecret?: string;
  refreshExpiresIn?: string | number;
  resetSecret?: string;
  isRevoked?: (payload: any) => Promise<boolean>;
}
```

### `ApiKeyAuthOptions`

```ts
interface ApiKeyAuthOptions {
  enabled: boolean;
  headerName?: string;
  validate: (apiKey: string) => Promise<boolean | { valid: boolean; permissions?: string[] }>;
}
```

### `RbacOptions`

```ts
interface RbacOptions {
  enabled: boolean;
  extractRoles?: (request: any) => string[];
  extractPermissions?: (request: any) => string[];
  hierarchy?: RoleDefinition[];
  superAdmin?: string;
  permissionStore?: PermissionStore;
}
```

### `RoleDefinition`

```ts
interface RoleDefinition {
  name: string;
  inherits?: string[];
  permissions?: string[];
}
```

### `PermissionStore`

```ts
interface PermissionStore {
  getUserPermissions(userId: string): Promise<string[]>;
  getUserRoles(userId: string): Promise<string[]>;
  assignRoles(userId: string, roles: string[]): Promise<void>;
  removeRoles(userId: string, roles: string[]): Promise<void>;
  assignPermissions(userId: string, permissions: string[]): Promise<void>;
  removePermissions(userId: string, permissions: string[]): Promise<void>;
  hasPermission(userId: string, permission: string): Promise<boolean>;
}
```

### `SessionStore`

```ts
interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, data: SessionData, maxAge?: number): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  touch(sessionId: string, maxAge?: number): Promise<void>;
}
```

### `SessionData`

```ts
interface SessionData {
  [key: string]: any;
  createdAt?: number;
  lastAccessedAt?: number;
}
```

### `SocialProfile`

```ts
interface SocialProfile {
  provider: string;
  providerId: string;
  email?: string;
  name?: string;
  avatar?: string;
  raw: Record<string, any>;
}
```

### `SocialProviderConfig`

```ts
interface SocialProviderConfig {
  strategy: 'google' | 'github';
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  scope?: string[];
}
```

---

## Constants / Tokens

| Token | Value | Description |
|-------|-------|-------------|
| `AUTH_OPTIONS` | `'BOOT_AUTH_OPTIONS'` | Injection token for the `AuthOptions` config object |
| `ROLES_KEY` | `'boot:roles'` | Reflector metadata key used by `@Roles()` and `RolesGuard` |
| `PERMISSIONS_KEY` | `'boot:permissions'` | Reflector metadata key used by `@Permissions()` and `PermissionsGuard` |
| `IS_PUBLIC_KEY` | `'boot:isPublic'` | Reflector metadata key used by `@Public()` and all guards |
| `PERMISSION_STORE` | `'BOOT_PERMISSION_STORE'` | Injection token for `PermissionStore` instance |
| `SUPERADMIN_ONLY_KEY` | `'boot:superadminOnly'` | Reflector metadata key used by `@SuperAdminOnly()` |
| `SESSION_OPTIONS` | `string` | Injection token for `SessionModuleOptions` |
| `SOCIAL_AUTH_OPTIONS` | `string` | Injection token for `SocialAuthOptions` |

---

## Token Store

### `TokenStore` interface

> Pluggable storage for refresh token family tracking and reuse detection.

```ts
interface TokenStore {
  storeToken(tokenId: string, familyId: string, userId: string, expiresAt: Date): Promise<void>;
  getToken(tokenId: string): Promise<{ familyId: string; userId: string; used: boolean } | null>;
  markUsed(tokenId: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  isFamilyRevoked(familyId: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
}
```

Each refresh token has a `tokenId` (unique per token) and a `familyId` (shared within a rotation chain). When a token is used to obtain a new access token, it is marked as `used` via `markUsed()` and a new token in the same family is issued. If a `used` token is presented again (reuse detected), `revokeFamily()` invalidates the entire chain.

Inject via the `TOKEN_STORE` token (`'BOOT_TOKEN_STORE'`).

### `MemoryTokenStore`

> In-memory `TokenStore` implementation. **Not for production** — state resets on restart.

Handles token expiry automatically: expired tokens are evicted on `getToken()` calls.

```ts
import { MemoryTokenStore } from '@nestjs-boot/auth/token';
// Register in AuthModule with { provide: TOKEN_STORE, useClass: MemoryTokenStore }
```

---

## Login Tracker

### `LoginTracker`

> In-memory brute-force protection — tracks failed login attempts per identifier and temporarily locks accounts after repeated failures.

Configure via `AuthOptions.loginTracker` or instantiate directly.

```ts
AuthModule.register({
  jwt: { ... },
  loginTracker: {
    maxAttempts: 5,            // default: 5
    lockoutDuration: 900_000,  // default: 15 minutes in ms
  },
})
```

Injectable via class token when `loginTracker` is configured.

#### Methods

##### `isLocked(identifier: string): boolean`

Check whether an account identifier (email, username, etc.) is currently locked. Automatically clears expired locks.

##### `recordFailure(identifier: string): boolean`

Increment the failure counter for an identifier. Returns `true` if the account is now locked (failure count reached `maxAttempts`).

##### `recordSuccess(identifier: string): void`

Reset the failure counter after a successful login.

##### `getRemainingAttempts(identifier: string): number`

Return how many more failures are allowed before lockout.

##### `unlock(identifier: string): void`

Manually remove the lockout and reset the failure counter (e.g. after admin intervention).

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | `number` | `5` | Failures before account is locked |
| `lockoutDuration` | `number` | `900000` | Lock duration in milliseconds (15 minutes) |

---

## Privilege Boundary

### `PrivilegeBoundary`

> Prevents privilege escalation — enforces that users can only assign roles/modify users at a lower authority level than their own.

Not automatically registered. Instantiate and wire as needed, or use via `RoleManager`.

```ts
import { PrivilegeBoundary } from '@nestjs-boot/auth/rbac';

const boundary = new PrivilegeBoundary([
  { name: 'superadmin', level: 100 },
  { name: 'admin',      level: 80 },
  { name: 'manager',    level: 50 },
  { name: 'user',       level: 10 },
]);

boundary.enforceAssignment(['admin'], 'manager'); // OK — admin (80) > manager (50)
boundary.enforceAssignment(['manager'], 'admin'); // throws ForbiddenException
```

#### Methods

##### `define(role: LeveledRole): void`

Register or update a role definition. Called automatically by `RoleManager.createRole()`.

##### `getLevel(roleName: string): number`

Return the numeric level for a role. Unknown roles return `0`.

##### `getMaxLevel(roleNames: string[]): number`

Return the highest level among a list of role names.

##### `canAssignRole(actorRoles: string[], targetRole: string): boolean`

Return `true` if the actor's max level is **strictly greater than** the target role's level.

##### `enforceAssignment(actorRoles: string[], targetRole: string): void`

Like `canAssignRole`, but throws `ForbiddenException` on failure.

##### `canModifyUser(actorRoles: string[], targetUserRoles: string[]): boolean`

Return `true` if the actor's max level is strictly greater than the target user's max role level.

##### `enforceModification(actorRoles: string[], targetUserRoles: string[]): void`

Like `canModifyUser`, but throws `ForbiddenException` on failure.

##### `getAllRoles(): LeveledRole[]`

Return all defined roles sorted by level descending.

#### `LeveledRole` interface

```ts
interface LeveledRole {
  name: string;
  level: number;        // Numeric authority level — higher = more privileged
  inherits?: string[];
  permissions?: string[];
}
```

---

## Role Manager

### `RoleManager`

> Manages role and permission definitions, role-permission assignments, and user-role assignments with optional privilege boundary enforcement.

Injectable via class token when configured. Works with any `PermissionStore` implementation.

#### Role CRUD

##### `createRole(role: RoleDefinitionRecord): RoleDefinitionRecord`

Create a role. Throws `ConflictException` if the code already exists. Automatically registers the role with `PrivilegeBoundary` (if wired).

##### `getRole(code: string): RoleDefinitionRecord`

Get a role by code. Throws `NotFoundException` if not found.

##### `listRoles(): RoleDefinitionRecord[]`

Return all roles sorted by level descending.

##### `updateRole(code: string, data: Partial<RoleDefinitionRecord>): RoleDefinitionRecord`

Update a role. Throws `ConflictException` when attempting to rename a system role (`isSystem: true`).

##### `deleteRole(code: string): void`

Delete a role. Throws `ConflictException` for system roles.

#### Permission CRUD

##### `createPermission(perm: PermissionDefinitionRecord): PermissionDefinitionRecord`

Create a permission definition. Throws `ConflictException` if code already exists.

##### `getPermission(code: string): PermissionDefinitionRecord`

Get a permission by code. Throws `NotFoundException` if not found.

##### `listPermissions(): PermissionDefinitionRecord[]`

Return all permission definitions.

#### Role-Permission assignment

##### `assignPermissionToRole(roleCode: string, permissionCode: string): void`

Add a permission to a role. Validates both exist first.

##### `removePermissionFromRole(roleCode: string, permissionCode: string): void`

Remove a permission from a role.

##### `getRolePermissions(roleCode: string): string[]`

Return all permission codes currently assigned to a role.

#### User-Role assignment

##### `assignRoleToUser(userId: string, roleCode: string, actorRoles?: string[]): Promise<void>`

Assign a role to a user. If `actorRoles` is supplied and a `PrivilegeBoundary` is wired, enforces that the actor has sufficient authority.

##### `removeRoleFromUser(userId: string, roleCode: string, actorRoles?: string[]): Promise<void>`

Remove a role from a user, with the same boundary check as `assignRoleToUser`.

##### `getUserRoles(userId: string): Promise<string[]>`

Return all role codes assigned to a user (via `PermissionStore`).

##### `getUserPermissions(userId: string): Promise<string[]>`

Return all permission codes for a user (via `PermissionStore`).

#### Seeding

##### `seed(roles: RoleDefinitionRecord[], permissions: PermissionDefinitionRecord[]): { rolesCreated, permissionsCreated }`

Idempotent bulk seed. Skips any role or permission code that already exists. Returns counts of newly created records.

#### `RoleDefinitionRecord` interface

```ts
interface RoleDefinitionRecord {
  code: string;
  name: string;
  description?: string;
  level: number;
  isSystem?: boolean;    // System roles cannot be renamed or deleted
  permissions: string[];
  inherits?: string[];
}
```

#### `PermissionDefinitionRecord` interface

```ts
interface PermissionDefinitionRecord {
  code: string;
  name: string;
  description?: string;
  resource: string;  // E.g. 'user', 'report'
  action: string;    // E.g. 'read', 'write', 'export'
}
```

---

## `denyByDefault` option in `RbacOptions`

When `rbac.denyByDefault: true` is set in `AuthModule.register()`, the `RolesGuard` and `PermissionsGuard` deny requests that reach routes with **no** `@Roles()` or `@Permissions()` decorator. Routes decorated with `@Public()` are always allowed regardless of this setting.

```ts
AuthModule.register({
  rbac: {
    enabled: true,
    denyByDefault: true,  // All undecorated routes → 403 (except @Public())
  },
})
```

Default is `false` (open-by-default). Enable in security-sensitive APIs to prevent accidentally unprotected routes.

---

## CLI Generator

### `npx nestjs-boot g auth`

Scaffolds a complete JWT auth flow in `src/auth/` of your project:

| File | Description |
|------|-------------|
| `user.schema.ts` | Mongoose User schema (email, passwordHash, name, roles, permissions, refreshToken, emailVerified) |
| `auth.dto.ts` | RegisterDto, LoginDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto |
| `auth.service.ts` | Full auth service — register, login, refresh, logout, forgot/reset password, profile |
| `auth.controller.ts` | 7 endpoints: register, login, refresh, logout, forgot-password, reset-password, me |
| `auth.module.ts` | `UserAuthModule` — wires Mongoose, service, controller |
| `auth.spec.ts` | Vitest integration test (register + login) |

**Password reset:** In dev mode, the reset token is logged to console via `Logger.warn()`. Replace with your email provider (SendGrid, SES, etc.) for production.

```bash
npx nestjs-boot g auth
# → 6 files created
# Next: npm i bcrypt, import UserAuthModule in AppModule
```
