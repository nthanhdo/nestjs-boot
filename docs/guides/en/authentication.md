# Authentication

> **TL;DR** — Register `AuthModule` once with your JWT secret. You get global `JwtAuthGuard`, `@Public()` bypass, `@CurrentUser()` extraction, refresh token rotation, password reset, email verification, API key auth, and WebSocket auth — all from one config object.

JWT-based authentication with `AuthModule`, including token signing/verification, refresh token rotation, password reset, email verification, API key auth, and WebSocket support.

## Setup

```ts
import { AuthModule } from 'nestjs-boot';

@Module({
  imports: [
    AuthModule.register({
      jwt: {
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '1h', algorithm: 'HS256' },
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        refreshExpiresIn: '7d',
        resetSecret: process.env.JWT_RESET_SECRET,
        isRevoked: async (payload) => {
          // Optional: check a blacklist
          return tokenBlacklistService.isRevoked(payload.jti);
        },
      },
      apiKey: {
        enabled: true,
        headerName: 'x-api-key', // default
        validate: async (key) => {
          const record = await apiKeyRepo.findByKey(key);
          if (!record) return false;
          return { valid: true, permissions: record.permissions };
        },
      },
    }),
  ],
})
export class AppModule {}
```

`AuthModule` is `@Global()` — registered once, available everywhere. When `jwt` is provided, `JwtAuthGuard` is registered as a global guard. When `apiKey.enabled` is true, `ApiKeyGuard` is also registered globally.

## BootJwtService

Inject `BootJwtService` anywhere to sign and verify tokens. It uses the `jsonwebtoken` library directly — no user model, no database.

```ts
import { BootJwtService } from 'nestjs-boot';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: BootJwtService) {}

  login(user: User) {
    const accessToken = this.jwt.sign({ sub: user.id, roles: user.roles });
    const refreshToken = this.jwt.signRefresh({ sub: user.id });
    return { accessToken, refreshToken };
  }

  refresh(oldRefreshToken: string) {
    // Verify old token, strip iat/exp/nbf, re-sign both tokens
    return this.jwt.rotateRefreshToken(oldRefreshToken);
  }

  forgotPassword(userId: string) {
    // Signs with resetSecret, includes purpose: 'password-reset', default 15m expiry
    return this.jwt.signPasswordReset(userId, { expiresIn: '30m' });
  }

  resetPassword(token: string, newPassword: string) {
    // Throws if invalid, expired, or wrong purpose
    const { sub } = this.jwt.verifyPasswordReset(token);
    return this.userService.updatePassword(sub, newPassword);
  }

  sendVerificationEmail(email: string) {
    // Signs with resetSecret, includes purpose: 'email-verification', default 24h expiry
    const token = this.jwt.signEmailVerification(email);
    return this.mailer.send(email, token);
  }

  verifyEmail(token: string) {
    // Throws if invalid, expired, or wrong purpose
    const { email } = this.jwt.verifyEmailVerification(token);
    return this.userService.markEmailVerified(email);
  }
}
```

### BootJwtService Methods

| Method | Description |
|--------|-------------|
| `sign(payload)` | Sign an access token with the main secret |
| `verify<T>(token)` | Verify and decode an access token. Throws on invalid/expired |
| `signRefresh(payload)` | Sign a refresh token using `refreshSecret` (falls back to main secret) |
| `verifyRefresh<T>(token)` | Verify a refresh token |
| `rotateRefreshToken(old)` | Verify old refresh, return new `{ accessToken, refreshToken }` |
| `signPasswordReset(userId, opts?)` | Sign a reset token (purpose-scoped, default 15m, uses `resetSecret`) |
| `verifyPasswordReset(token)` | Verify reset token and check `purpose: 'password-reset'` |
| `signEmailVerification(email, opts?)` | Sign a verification token (default 24h, uses `resetSecret`) |
| `verifyEmailVerification(token)` | Verify and check `purpose: 'email-verification'` |

## JwtAuthGuard

Registered globally when `jwt` config is present. Extracts `Bearer <token>` from the `Authorization` header, verifies it, and attaches the decoded payload to `request.user`.

If `isRevoked` is configured, the guard calls it after successful verification — a revoked token throws `UnauthorizedException`.

### @Public() Decorator

Skip auth on specific routes:

```ts
import { Public } from 'nestjs-boot';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

### @CurrentUser() Decorator

Extract the authenticated user from `request.user`:

```ts
import { CurrentUser } from 'nestjs-boot';

@Controller('profile')
export class ProfileController {
  @Get()
  getProfile(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Get('id')
  getId(@CurrentUser('sub') userId: string) {
    return { userId };
  }
}
```

## API Key Auth

When `apiKey.enabled` is true, `ApiKeyGuard` is registered globally. It reads the key from the configured header (default `x-api-key`) and calls your `validate` function.

The `validate` function can return:
- `boolean` — simple valid/invalid
- `{ valid: boolean; permissions?: string[] }` — valid with attached permissions (stored on `request.user.permissions`)

```ts
AuthModule.register({
  apiKey: {
    enabled: true,
    headerName: 'x-api-key',
    validate: async (key) => {
      const record = await db.apiKeys.findOne({ key });
      if (!record) return false;
      return { valid: true, permissions: record.scopes };
    },
  },
})
```

Both `JwtAuthGuard` and `ApiKeyGuard` respect `@Public()`.

## WebSocket Auth (WsJwtGuard)

`WsJwtGuard` authenticates WebSocket connections. It is **not** registered globally — apply it where needed.

Token extraction order:
1. `client.handshake.headers.authorization` (Bearer token)
2. `client.handshake.auth.token` (Socket.IO auth object)
3. `client.upgradeReq.headers.authorization` (raw ws)

Decoded payload is attached to `client.data.user`.

```ts
import { WsJwtGuard } from 'nestjs-boot';

@UseGuards(WsJwtGuard)
@WebSocketGateway()
export class ChatGateway {
  @SubscribeMessage('message')
  handleMessage(@ConnectedSocket() client: Socket) {
    const user = client.data.user;
    // ...
  }
}
```

## Algorithm Pinning

The default algorithm is `HS256`. Override via `signOptions.algorithm`:

```ts
AuthModule.register({
  jwt: {
    secret: process.env.JWT_SECRET,
    signOptions: { algorithm: 'HS384' },
  },
})
```

The configured algorithm is enforced during verification — the guard passes `algorithms: [configured]` to `jwt.verify()`, preventing algorithm confusion attacks.

## Swagger Integration

If `@nestjs/swagger` is installed, configure Bearer auth on your Swagger document:

```ts
const document = SwaggerModule.createDocument(app, config);
AuthModule.configureSwaggerAuth(document);
SwaggerModule.setup('api', app, document);
```

## JWT Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | *required* | Main signing secret |
| `signOptions.expiresIn` | `string \| number` | — | Access token TTL (e.g. `'1h'`, `3600`) |
| `signOptions.algorithm` | `string` | `'HS256'` | JWT algorithm (pinned on verify) |
| `refreshSecret` | `string` | `secret` | Separate secret for refresh tokens |
| `refreshExpiresIn` | `string \| number` | — | Refresh token TTL |
| `resetSecret` | `string` | `secret` | Separate secret for password-reset and email-verification tokens |
| `isRevoked` | `(payload) => Promise<boolean>` | — | Optional revocation check after verify |

## Best Practices

1. **Use separate secrets** for access, refresh, and reset tokens. A leaked access secret should not compromise password resets.
2. **Set short access token TTLs** (15m-1h) and use refresh token rotation (`rotateRefreshToken`).
3. **Pin your algorithm** explicitly. The default `HS256` is safe, but always be explicit.
4. **Implement `isRevoked`** for logout / force-sign-out by checking a token blacklist (Redis SET of JTI values).
5. **Purpose-scoped tokens** (`signPasswordReset`, `signEmailVerification`) embed a `purpose` claim that is checked on verification — a password reset token cannot be used as an access token.
6. **Never store JWTs in localStorage** on the client. Use httpOnly cookies or in-memory storage.

## See also

- [Authorization (RBAC)](authorization.md) — role and permission guards on top of JWT auth
- [Rate Limiting Auth](auth-rate-limiting.md) — throttle login and reset endpoints
- [Session, Social Login & TOTP](session-social-totp.md) — cookie sessions, OAuth, and 2FA
- [Inter-Service Auth](inter-service-auth.md) — propagate tokens across microservices
- [Testing Guide](testing-guide.md) — `createTestJwt`, `MockAuthModule` for test auth
