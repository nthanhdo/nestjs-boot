# Xác thực (Authentication)

Xác thực dựa trên JWT với `AuthModule`, bao gồm ký/xác minh token, xoay refresh token, đặt lại mật khẩu, xác minh email, xác thực API key, và hỗ trợ WebSocket.

## Thiết lập

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

`AuthModule` là `@Global()` — đăng ký một lần, sử dụng được ở mọi nơi. Khi `jwt` được cung cấp, `JwtAuthGuard` được đăng ký làm global guard. Khi `apiKey.enabled` là true, `ApiKeyGuard` cũng được đăng ký toàn cục.

## BootJwtService

Inject `BootJwtService` ở bất kỳ đâu để ký và xác minh token. Nó sử dụng thư viện `jsonwebtoken` trực tiếp — không user model, không database.

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

### Các method của BootJwtService

| Method | Mô tả |
|--------|-------------|
| `sign(payload)` | Ký access token với secret chính |
| `verify<T>(token)` | Xác minh và decode access token. Throw nếu không hợp lệ/hết hạn |
| `signRefresh(payload)` | Ký refresh token bằng `refreshSecret` (fallback sang secret chính) |
| `verifyRefresh<T>(token)` | Xác minh refresh token |
| `rotateRefreshToken(old)` | Xác minh refresh cũ, trả về `{ accessToken, refreshToken }` mới |
| `signPasswordReset(userId, opts?)` | Ký reset token (có purpose, mặc định 15m, dùng `resetSecret`) |
| `verifyPasswordReset(token)` | Xác minh reset token và kiểm tra `purpose: 'password-reset'` |
| `signEmailVerification(email, opts?)` | Ký verification token (mặc định 24h, dùng `resetSecret`) |
| `verifyEmailVerification(token)` | Xác minh và kiểm tra `purpose: 'email-verification'` |

## JwtAuthGuard

Đăng ký toàn cục khi có config `jwt`. Trích xuất `Bearer <token>` từ header `Authorization`, xác minh, và gắn payload đã decode vào `request.user`.

Nếu `isRevoked` được cấu hình, guard gọi nó sau khi xác minh thành công — token bị thu hồi sẽ throw `UnauthorizedException`.

### Decorator @Public()

Bỏ qua auth trên route cụ thể:

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

### Decorator @CurrentUser()

Trích xuất user đã xác thực từ `request.user`:

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

## Xác thực API Key

Khi `apiKey.enabled` là true, `ApiKeyGuard` được đăng ký toàn cục. Nó đọc key từ header đã cấu hình (mặc định `x-api-key`) và gọi hàm `validate` của bạn.

Hàm `validate` có thể trả về:
- `boolean` — hợp lệ/không hợp lệ đơn giản
- `{ valid: boolean; permissions?: string[] }` — hợp lệ kèm permission (lưu trên `request.user.permissions`)

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

Cả `JwtAuthGuard` và `ApiKeyGuard` đều tôn trọng `@Public()`.

## Xác thực WebSocket (WsJwtGuard)

`WsJwtGuard` xác thực kết nối WebSocket. Nó **không** được đăng ký toàn cục — áp dụng ở nơi cần.

Thứ tự trích xuất token:
1. `client.handshake.headers.authorization` (Bearer token)
2. `client.handshake.auth.token` (Socket.IO auth object)
3. `client.upgradeReq.headers.authorization` (raw ws)

Payload đã decode được gắn vào `client.data.user`.

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

## Cố định thuật toán (Algorithm Pinning)

Thuật toán mặc định là `HS256`. Ghi đè qua `signOptions.algorithm`:

```ts
AuthModule.register({
  jwt: {
    secret: process.env.JWT_SECRET,
    signOptions: { algorithm: 'HS384' },
  },
})
```

Thuật toán đã cấu hình được áp dụng khi xác minh — guard truyền `algorithms: [configured]` vào `jwt.verify()`, ngăn chặn tấn công algorithm confusion.

## Tích hợp Swagger

Nếu `@nestjs/swagger` đã cài, cấu hình Bearer auth trên Swagger document:

```ts
const document = SwaggerModule.createDocument(app, config);
AuthModule.configureSwaggerAuth(document);
SwaggerModule.setup('api', app, document);
```

## Tùy chọn JWT Config

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `secret` | `string` | *bắt buộc* | Secret ký chính |
| `signOptions.expiresIn` | `string \| number` | — | TTL access token (ví dụ `'1h'`, `3600`) |
| `signOptions.algorithm` | `string` | `'HS256'` | Thuật toán JWT (cố định khi xác minh) |
| `refreshSecret` | `string` | `secret` | Secret riêng cho refresh token |
| `refreshExpiresIn` | `string \| number` | — | TTL refresh token |
| `resetSecret` | `string` | `secret` | Secret riêng cho token đặt lại mật khẩu và xác minh email |
| `isRevoked` | `(payload) => Promise<boolean>` | — | Kiểm tra thu hồi sau khi xác minh (optional) |

## Best Practices

1. **Dùng secret riêng** cho access, refresh, và reset token. Secret access bị lộ không nên ảnh hưởng đến đặt lại mật khẩu.
2. **Đặt TTL access token ngắn** (15m-1h) và dùng xoay refresh token (`rotateRefreshToken`).
3. **Cố định thuật toán** rõ ràng. `HS256` mặc định là an toàn, nhưng luôn nên chỉ định rõ.
4. **Implement `isRevoked`** cho logout / buộc đăng xuất bằng cách kiểm tra blacklist token (Redis SET chứa giá trị JTI).
5. **Token có purpose** (`signPasswordReset`, `signEmailVerification`) nhúng claim `purpose` được kiểm tra khi xác minh — reset token không thể dùng làm access token.
6. **Không bao giờ lưu JWT trong localStorage** ở phía client. Dùng httpOnly cookie hoặc lưu trong bộ nhớ.
