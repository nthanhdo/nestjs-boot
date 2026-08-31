# Auth API Reference

> Composable, opt-in authentication and RBAC — JWT, API key, roles, permissions, sessions, TOTP, and social login. No forced user model.

## Module Registration

### `AuthModule`

```ts
AuthModule.register(options: AuthOptions): DynamicModule
```

`AuthModule` is `global: true`. Only the guards for configured strategies are activated.

```ts
import { AuthModule } from '@nestjs-boot/auth';

AuthModule.register({
  jwt: {
    secret: 'my-32-char-minimum-secret-here!!',
    signOptions: { expiresIn: '1h' },
    refreshSecret: 'another-32-char-refresh-secret!!',
    refreshExpiresIn: '7d',
  },
  apiKey: {
    enabled: true,
    headerName: 'x-api-key',           // default
    validate: async (key) => myDb.findApiKey(key) !== null,
  },
  rbac: {
    enabled: true,
    extractRoles: (req) => req.user?.roles ?? [],
    extractPermissions: (req) => req.user?.permissions ?? [],
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
| `apiKey.validate` | `(key) => Promise<boolean \| { valid: boolean; permissions?: string[] }>` | — | **Required.** Caller-provided key validator |
| `rbac` | `RbacOptions` | — | Enable role/permission guards |
| `rbac.enabled` | `boolean` | — | **Required when `rbac` is set** |
| `rbac.extractRoles` | `(req) => string[]` | `req.user?.roles ?? []` | Extract roles from the request |
| `rbac.extractPermissions` | `(req) => string[]` | `req.user?.permissions ?? []` | Extract permissions from the request |

---

### `SessionAuthModule`

```ts
SessionAuthModule.register(options: SessionModuleOptions): DynamicModule
```

Session-based authentication. Store-agnostic — plug in any `SessionStore` implementation. Defaults to `MemorySessionStore` (development only).

```ts
import { SessionAuthModule } from '@nestjs-boot/auth/session';

SessionAuthModule.register({
  secret: 'session-signing-secret',
  store: new RedisSessionStore(redisClient), // user-provided implementation
  maxAge: 3_600_000, // 1 hour in ms
  cookieName: 'boot.sid',
  httpOnly: true,
  secure: true,  // set true in production
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

Requires `passport-google-oauth20` or `passport-github2` to be installed depending on the strategy used.

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

### `PermissionsGuard`

Checks that `request.user` has **all** permissions required by `@Permissions()`. Routes without `@Permissions()` pass through.

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

Mark a route as requiring **any** of the specified roles. Works with `RolesGuard`.

```ts
@Roles('admin', 'moderator')
@Get('dashboard')
getDashboard() {}
```

### `@Permissions(...permissions: string[])`

Mark a route as requiring **all** of the specified permissions. Works with `PermissionsGuard`.

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
getId(@CurrentUser('id') userId: string) {}
```

### `@Session(field?: string)`

Parameter decorator. Extracts `request.session` (set by `SessionGuard`) or a specific field.

```ts
@Get('me')
getMe(@Session('userId') userId: string) {}
```

---

## Interfaces

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
}
```

### `AuthOptions`

```ts
interface AuthOptions {
  jwt?: JwtAuthOptions;
  apiKey?: ApiKeyAuthOptions;
  rbac?: RbacOptions;
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
  createdAt?: number;      // epoch ms
  lastAccessedAt?: number; // epoch ms
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

| Token | Type | Description |
|-------|------|-------------|
| `AUTH_OPTIONS` | `string` | Injection token for the `AuthOptions` config object |
| `ROLES_KEY` | `string` (`'boot:roles'`) | Reflector metadata key used by `@Roles()` and `RolesGuard` |
| `PERMISSIONS_KEY` | `string` (`'boot:permissions'`) | Reflector metadata key used by `@Permissions()` and `PermissionsGuard` |
| `IS_PUBLIC_KEY` | `string` (`'boot:isPublic'`) | Reflector metadata key used by `@Public()` and all guards |
| `SESSION_OPTIONS` | `string` | Injection token for `SessionModuleOptions` |
| `SOCIAL_AUTH_OPTIONS` | `string` | Injection token for `SocialAuthOptions` |
