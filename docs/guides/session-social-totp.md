# Session, Social Login, and TOTP (2FA)

Three standalone auth modules that complement JWT authentication: cookie-based sessions, OAuth social login, and TOTP two-factor authentication.

## Session Authentication

`SessionAuthModule` provides cookie-based session auth with a pluggable store interface.

### Setup

```ts
import { SessionAuthModule } from 'nestjs-boot';

@Module({
  imports: [
    SessionAuthModule.register({
      secret: process.env.SESSION_SECRET,
      store: new RedisSessionStore(redisClient), // you implement this
      cookieName: 'boot.sid',
      maxAge: 3600000, // 1h
      httpOnly: true,
      secure: true, // set true in production
      sameSite: 'lax',
    }),
  ],
})
export class AppModule {}
```

If no `store` is provided, `MemorySessionStore` is used (development only — sessions are lost on restart).

### SessionGuard

`SessionGuard` is **not** registered globally — apply it to routes or controllers:

```ts
import { SessionGuard, Session } from 'nestjs-boot';

@UseGuards(SessionGuard)
@Controller('dashboard')
export class DashboardController {
  @Get()
  index(@Session() session: SessionData) {
    return { userId: session.userId };
  }

  @Get('user')
  getUser(@Session('userId') userId: string) {
    return this.userService.findById(userId);
  }
}
```

The guard reads the session ID from the configured cookie, verifies its HMAC signature against `secret`, fetches session data from the store, and attaches it to `request.session`. It also calls `store.touch()` on each request to extend the TTL.

Respects `@Public()` from the core auth module.

### SessionStore Interface

Implement this interface for your preferred backend (Redis, database, etc.):

```ts
import { SessionStore, SessionData } from 'nestjs-boot';

class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: Redis) {}

  async get(sessionId: string): Promise<SessionData | null> {
    const data = await this.redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async set(sessionId: string, data: SessionData, maxAge?: number): Promise<void> {
    const ttl = maxAge ?? 86400000;
    await this.redis.set(`session:${sessionId}`, JSON.stringify(data), 'PX', ttl);
  }

  async destroy(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
  }

  async touch(sessionId: string, maxAge?: number): Promise<void> {
    const ttl = maxAge ?? 86400000;
    await this.redis.pexpire(`session:${sessionId}`, ttl);
  }
}
```

### Session Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | *required* | Secret for signing session cookies (HMAC-SHA256) |
| `store` | `SessionStore` | `MemorySessionStore` | Session storage backend |
| `cookieName` | `string` | `'boot.sid'` | Name of the session cookie |
| `maxAge` | `number` | `86400000` (24h) | Session TTL in milliseconds |
| `httpOnly` | `boolean` | `true` | Set httpOnly flag on cookie |
| `secure` | `boolean` | `false` | Set secure flag on cookie |
| `sameSite` | `'strict' \| 'lax' \| 'none'` | `'lax'` | SameSite cookie attribute |

## Social Login

`SocialAuthModule` wraps Passport strategies (Google, GitHub) and returns a normalized `SocialProfile` — no forced user model.

### Setup

```ts
import { SocialAuthModule } from 'nestjs-boot';

@Module({
  imports: [
    SocialAuthModule.register({
      providers: [
        {
          strategy: 'google',
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: '/auth/google/callback',
          scope: ['email', 'profile'], // default
        },
        {
          strategy: 'github',
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: '/auth/github/callback',
          scope: ['user:email'], // default
        },
      ],
      onProfile: async (profile: SocialProfile) => {
        // You decide: create user, link account, reject, etc.
        return userService.findOrCreateBySocial(profile);
      },
    }),
  ],
})
export class AppModule {}
```

**Peer dependencies:** Install the passport strategy for each provider:
- Google: `npm install passport-google-oauth20`
- GitHub: `npm install passport-github2`

### SocialProfile

All strategies return the same normalized shape:

```ts
interface SocialProfile {
  provider: string;       // 'google' | 'github'
  providerId: string;     // unique ID from the provider
  email?: string;
  name?: string;
  avatar?: string;
  raw: Record<string, any>; // full provider response
}
```

### Provider Config

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strategy` | `'google' \| 'github'` | *required* | OAuth provider |
| `clientID` | `string` | *required* | OAuth client ID |
| `clientSecret` | `string` | *required* | OAuth client secret |
| `callbackURL` | `string` | *required* | OAuth callback URL |
| `scope` | `string[]` | `['email','profile']` / `['user:email']` | OAuth scopes |

## TOTP / Two-Factor Authentication

`TotpModule` provides TOTP utilities for 2FA. No storage — you store the secret in your user model.

### Setup

```ts
import { TotpModule } from 'nestjs-boot';

@Module({
  imports: [TotpModule],
})
export class AuthModule {}
```

Uses the `otpauth` library if installed (`npm install otpauth`), otherwise falls back to a built-in HMAC-based implementation.

### Usage

```ts
import { TotpService } from 'nestjs-boot';

@Injectable()
export class TwoFactorService {
  constructor(private readonly totp: TotpService) {}

  async enable2FA(user: User) {
    const { secret, otpauthUrl, qrDataUrl } = this.totp.generateSecret(
      user.email,
      'MyApp', // issuer name
    );
    // Store `secret` in your user model (encrypted)
    await this.userRepo.update(user.id, { totpSecret: secret });
    // Return QR code URL for the user to scan
    return { otpauthUrl, qrDataUrl };
  }

  verify2FA(user: User, token: string): boolean {
    // Allows +/- 1 time window (30s) for clock drift
    return this.totp.verify(token, user.totpSecret);
  }

  generateBackupCodes(): string[] {
    // Returns 8 codes in XXXX-XXXX format (e.g., 'A1B2-C3D4')
    // You store these (hashed) and track which are used
    return this.totp.generateBackupCodes(8);
  }
}
```

### TotpService Methods

| Method | Description |
|--------|-------------|
| `generateSecret(label, issuer?)` | Generate secret + `otpauthUrl` + `qrDataUrl`. Issuer defaults to `'NestJS-Boot'` |
| `verify(token, secret)` | Verify a 6-digit TOTP token. Allows +/-1 time window for clock drift |
| `generateBackupCodes(count?)` | Generate `count` one-time backup codes (default 8, format `XXXX-XXXX`) |

## Best Practices

1. **Never use `MemorySessionStore` in production.** Implement `SessionStore` with Redis or a database.
2. **Set `secure: true` and `sameSite: 'strict'`** for production session cookies.
3. **Store TOTP secrets encrypted** in your database, not in plaintext.
4. **Hash backup codes** before storing. Compare hashes on verification. Track which codes are consumed.
5. **Social login `onProfile` callback** is where you implement your user-creation/linking logic — the module intentionally does not force a user model.
6. **Combine modules freely.** Use JWT for API auth, sessions for web UI, social login for onboarding, and TOTP for sensitive operations — all in the same application.
