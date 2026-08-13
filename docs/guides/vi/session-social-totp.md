# Session, Social Login, và TOTP (2FA)

Ba module xác thực độc lập bổ sung cho JWT authentication: session dựa trên cookie, OAuth social login, và TOTP xác thực hai yếu tố.

## Session Authentication

`SessionAuthModule` cung cấp xác thực session dựa trên cookie với interface store có thể thay thế.

### Thiết lập

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

Nếu không cung cấp `store`, `MemorySessionStore` được sử dụng (chỉ dùng cho development — session mất khi restart).

### SessionGuard

`SessionGuard` **không** được đăng ký toàn cục — áp dụng cho route hoặc controller cụ thể:

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

Guard đọc session ID từ cookie đã cấu hình, xác minh chữ ký HMAC với `secret`, fetch dữ liệu session từ store, và gắn vào `request.session`. Nó cũng gọi `store.touch()` trên mỗi request để gia hạn TTL.

Tôn trọng `@Public()` từ module auth chính.

### Interface SessionStore

Implement interface này cho backend bạn chọn (Redis, database, v.v.):

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

### Tùy chọn Session Config

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `secret` | `string` | *bắt buộc* | Secret để ký session cookie (HMAC-SHA256) |
| `store` | `SessionStore` | `MemorySessionStore` | Backend lưu trữ session |
| `cookieName` | `string` | `'boot.sid'` | Tên session cookie |
| `maxAge` | `number` | `86400000` (24h) | TTL session tính bằng millisecond |
| `httpOnly` | `boolean` | `true` | Đặt flag httpOnly trên cookie |
| `secure` | `boolean` | `false` | Đặt flag secure trên cookie |
| `sameSite` | `'strict' \| 'lax' \| 'none'` | `'lax'` | Thuộc tính SameSite của cookie |

## Social Login

`SocialAuthModule` bọc các Passport strategy (Google, GitHub) và trả về `SocialProfile` đã chuẩn hóa — không ép buộc user model.

### Thiết lập

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

**Peer dependency:** Cài passport strategy cho mỗi provider:
- Google: `npm install passport-google-oauth20`
- GitHub: `npm install passport-github2`

### SocialProfile

Tất cả strategy trả về cùng một cấu trúc chuẩn hóa:

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

### Tùy chọn Provider Config

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `strategy` | `'google' \| 'github'` | *bắt buộc* | OAuth provider |
| `clientID` | `string` | *bắt buộc* | OAuth client ID |
| `clientSecret` | `string` | *bắt buộc* | OAuth client secret |
| `callbackURL` | `string` | *bắt buộc* | URL callback OAuth |
| `scope` | `string[]` | `['email','profile']` / `['user:email']` | Phạm vi OAuth |

## TOTP / Xác thực hai yếu tố

`TotpModule` cung cấp tiện ích TOTP cho 2FA. Không lưu trữ — bạn tự lưu secret trong user model.

### Thiết lập

```ts
import { TotpModule } from 'nestjs-boot';

@Module({
  imports: [TotpModule],
})
export class AuthModule {}
```

Sử dụng thư viện `otpauth` nếu đã cài (`npm install otpauth`), nếu không thì fallback sang implementation HMAC tích hợp.

### Cách sử dụng

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

### Các method của TotpService

| Method | Mô tả |
|--------|-------------|
| `generateSecret(label, issuer?)` | Tạo secret + `otpauthUrl` + `qrDataUrl`. Issuer mặc định là `'NestJS-Boot'` |
| `verify(token, secret)` | Xác minh token TOTP 6 chữ số. Cho phép +/-1 cửa sổ thời gian cho lệch đồng hồ |
| `generateBackupCodes(count?)` | Tạo `count` mã backup dùng một lần (mặc định 8, format `XXXX-XXXX`) |

## Best Practices

1. **Không bao giờ dùng `MemorySessionStore` trong production.** Implement `SessionStore` với Redis hoặc database.
2. **Đặt `secure: true` và `sameSite: 'strict'`** cho session cookie trong production.
3. **Lưu TOTP secret đã mã hóa** trong database, không phải plaintext.
4. **Hash mã backup** trước khi lưu. So sánh hash khi xác minh. Theo dõi mã nào đã sử dụng.
5. **Callback `onProfile` của social login** là nơi bạn implement logic tạo/liên kết user — module cố ý không ép buộc user model.
6. **Kết hợp module tự do.** Dùng JWT cho API auth, session cho web UI, social login cho onboarding, và TOTP cho thao tác nhạy cảm — tất cả trong cùng ứng dụng.
