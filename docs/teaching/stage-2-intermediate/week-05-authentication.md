# Tuần 5: Authentication & Authorization

> **Stage 2 — Intermediate | Tuần 5/8**
> Prerequisite: Đã hoàn thành Stage 1 (TypeScript, NestJS cơ bản, MongoDB, REST API)

---

## Mục tiêu học tập

Sau bài này, bạn có thể:

1. Phân biệt rõ Authentication vs Authorization — và tại sao nhầm lẫn hai khái niệm này gây ra lỗ hổng bảo mật
2. Giải thích cấu trúc JWT (header.payload.signature) và decode thủ công trên jwt.io
3. Thiết kế luồng Access Token + Refresh Token hoàn chỉnh
4. Implement NestJS Guards với `@Public()`, `@Roles()`, `@Permissions()` decorators
5. Bảo vệ API endpoint cho cả user (JWT) và machine-to-machine (API Key)

---

## 1. Authentication vs Authorization

### 1.1 Tại sao phân biệt quan trọng?

Đây là hai khái niệm bị nhầm lẫn thường xuyên, và nhầm ở tầng thiết kế sẽ dẫn đến lỗ hổng bảo mật không vá được.

**Analogy thực tế:**

> Bạn đến cơ quan chính phủ xin giấy tờ.
>
> - **Authentication (Xác thực):** Bảo vệ cổng kiểm tra CMND của bạn — "Bạn là ai?"
> - **Authorization (Phân quyền):** Nhân viên phòng hành chính kiểm tra bạn có quyền lấy hồ sơ mật không — "Bạn được làm gì?"

CMND hợp lệ ≠ được vào mọi phòng. Hai bước này độc lập.

**Trong code:**

```
Request đến
    │
    ▼
[Guard 1: JwtAuthGuard]  ← Authentication: "Token có hợp lệ không?"
    │ request.user = { sub: '123', role: 'admin' }
    ▼
[Guard 2: RolesGuard]    ← Authorization: "user này có role 'admin' không?"
    │
    ▼
Controller handler
```

---

## 2. Password Security — Từ Plaintext đến Argon2

### 2.1 Hành trình lịch sử

Đây không phải lý thuyết thuần túy — mỗi bước đều xuất phát từ một vụ rò rỉ dữ liệu thực tế.

#### Giai đoạn 1: Plaintext (Sai hoàn toàn)

```typescript
// ❌ KHÔNG BAO GIỜ làm thế này
user.password = 'mypassword123'
await userRepo.save(user)
// Nếu DB bị dump → hacker có ngay mật khẩu
```

**Sự cố:** LinkedIn 2012 — 117 triệu tài khoản bị lộ mật khẩu dạng MD5 không có salt.

#### Giai đoạn 2: MD5 (Không đủ)

```typescript
// ❌ Vẫn sai — MD5 quá nhanh
import { createHash } from 'crypto'
user.password = createHash('md5').update('mypassword123').digest('hex')
// md5('mypassword123') = '...luôn ra cùng 1 kết quả'
// Rainbow table attack: tra bảng lookup → crack trong giây
```

**Vấn đề MD5:**
- Quá nhanh (hàng tỷ lần/giây trên GPU)
- Không có salt → cùng password = cùng hash
- Rainbow table: precomputed hash lookup

#### Giai đoạn 3: bcrypt (Đủ dùng)

```typescript
import * as bcrypt from 'bcrypt'

// Hash với cost factor = 12 (2^12 = 4096 vòng lặp)
const hash = await bcrypt.hash('mypassword123', 12)

// Verify
const isValid = await bcrypt.compare('mypassword123', hash)
```

**Tại sao bcrypt tốt hơn:**
- **Salt tự động:** mỗi lần hash ra kết quả khác nhau
- **Cost factor (rounds):** tăng được theo thời gian khi CPU mạnh hơn
- **Chậm có chủ đích:** 100ms/verify → brute force không khả thi

#### Giai đoạn 4: Argon2 (Best practice hiện tại)

```typescript
import * as argon2 from 'argon2'

const hash = await argon2.hash('mypassword123', {
  type: argon2.argon2id,    // hybrid mode (resistant to GPU + side-channel)
  memoryCost: 65536,        // 64MB RAM → GPU farm kém hiệu quả
  timeCost: 3,              // 3 iterations
  parallelism: 4,
})

const isValid = await argon2.verify(hash, 'mypassword123')
```

**Argon2 thắng bcrypt vì:**
- Memory-hard: cần RAM lớn → tấn công bằng ASIC/GPU tốn kém
- Được chọn bởi Password Hashing Competition 2015

### 2.2 Rule ngón tay cái

| Scenario | Recommendation |
|----------|---------------|
| Production mới | Argon2id |
| Legacy system | bcrypt cost≥12 |
| Cần migrate | Verify với cũ → re-hash khi login thành công |

---

## 3. JWT Deep Dive

### 3.1 Cấu trúc JWT

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE2MDAwMDAwMDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
│──────────────────────────────────────│──────────────────────────────────────────────────────│───────────────────────────────────────────────────────│
              HEADER                                      PAYLOAD                                               SIGNATURE
```

**Header** (Base64URL decoded):
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload** (Base64URL decoded — **KHÔNG encrypted**):
```json
{
  "sub": "123",
  "role": "admin",
  "iat": 1600000000,
  "exp": 1600003600
}
```

**Signature:**
```
HMACSHA256(
  base64url(header) + "." + base64url(payload),
  SECRET_KEY
)
```

### 3.2 SECURITY DEMO: JWT không phải là bí mật

> **Thực hành ngay:** Mở [jwt.io](https://jwt.io), paste token bất kỳ vào ô "Encoded".

Bạn sẽ thấy **toàn bộ payload hiện ra ngay lập tức** mà không cần secret key!

**Bài học:** JWT xác thực *tính toàn vẹn* (không ai sửa), không phải *bảo mật dữ liệu*. Đừng bao giờ để thông tin nhạy cảm (số CMND, địa chỉ nhà, mật khẩu...) trong payload.

### 3.3 HS256 vs RS256

| | HS256 | RS256 |
|---|---|---|
| Algorithm | HMAC-SHA256 (symmetric) | RSA-SHA256 (asymmetric) |
| Sign & Verify | Cùng 1 secret | Private key sign, Public key verify |
| Ai verify được | Chỉ ai biết secret | Bất kỳ ai có public key |
| Use case | Monolith, single service | Microservices, third-party verify |
| Ví dụ | Internal API | Auth server → nhiều service downstream |

### 3.4 Stateless — Trade-offs thực tế

**JWT Stateless:** Server không lưu session → scale ngang dễ dàng.

```
Request 1 → Server A ✅ (verify token locally)
Request 2 → Server B ✅ (verify token locally, no shared state needed)
Request 3 → Server C ✅
```

**Nhược điểm của Stateless:**
- Không thể logout ngay lập tức (token còn hạn là còn dùng được)
- Không thể thu hồi quyền truy cập trong thời gian thực
- Token bị đánh cắp → valid cho đến khi hết hạn

**Giải pháp:** Kết hợp `isRevoked` check (optional) — xem phần Guards bên dưới.

### 3.5 Access Token + Refresh Token

**Vấn đề:** Access token hết hạn nhanh (15 phút) → UX kém. Hạn dài (7 ngày) → bị đánh cắp nguy hiểm.

**Giải pháp:** 2 loại token với vòng đời khác nhau.

```
┌──────────────────────────────────────────────────────────┐
│                     LOGIN FLOW                           │
│                                                          │
│  Client          │          Server                       │
│    │             │             │                         │
│    │──POST /login──────────────▶│                        │
│    │             │             │ verify credentials      │
│    │◀─ 200 ──────────────────── │                        │
│    │   accessToken (15m)        │                        │
│    │   refreshToken (7d)        │                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   NORMAL REQUEST FLOW                    │
│    │                                                     │
│    │──GET /products (Bearer accessToken)────────────────▶│
│    │◀─ 200 + data ──────────────────────────────────────  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   REFRESH FLOW                           │
│    │                                                     │
│    │──GET /products (expired accessToken)───────────────▶│
│    │◀─ 401 Unauthorized ──────────────────────────────── │
│    │                                                     │
│    │──POST /auth/refresh (Bearer refreshToken)──────────▶│
│    │◀─ 200 { newAccessToken, newRefreshToken } ──────── │
│    │                                                     │
│    │──GET /products (Bearer newAccessToken)─────────────▶│
│    │◀─ 200 + data ──────────────────────────────────────  │
└──────────────────────────────────────────────────────────┘
```

**Tại sao cần refresh token riêng?**
- Refresh token chỉ gửi đến 1 endpoint (`/auth/refresh`)
- Access token gửi đến mọi API → exposure lớn hơn
- Có thể lưu refresh token trong DB → revoke được khi cần

---

## 4. Đọc Source: nestjs-boot Auth Module

### 4.1 BootJwtService — `src/auth/services/jwt.service.ts`

Service này là **pure JWT utility** — không biết user là ai, không dùng DB.

```typescript
// Khởi tạo qua Dependency Injection
@Injectable()
export class BootJwtService {
  constructor(@Inject(AUTH_OPTIONS) authOptions: AuthOptions) {
    this.secret = authOptions.jwt!.secret
    this.refreshSecret = authOptions.jwt!.refreshSecret ?? authOptions.jwt!.secret
    this.resetSecret = authOptions.jwt!.resetSecret ?? authOptions.jwt!.secret
  }

  sign(payload: Record<string, any>): string { ... }
  verify<T>(token: string): T { ... }
  signRefresh(payload: Record<string, any>): string { ... }
  verifyRefresh<T>(token: string): T { ... }
  rotateRefreshToken(oldToken: string): { accessToken: string; refreshToken: string } { ... }
  signPasswordReset(userId: string, options?: { expiresIn?: string }): string { ... }
  verifyPasswordReset(token: string): { sub: string; purpose: string } { ... }
}
```

**Điểm đáng chú ý:**
- `resetSecret` tách biệt với `secret` và `refreshSecret` — password-reset token không thể dùng như access token
- `purpose` claim trong payload: `signPasswordReset` inject `purpose: 'password-reset'` → verify check claim này → prevent token misuse
- `rotateRefreshToken`: strip `iat/exp/nbf/jti` trước khi re-sign → payload sạch

### 4.2 JwtAuthGuard — `src/auth/guards/jwt-auth.guard.ts`

```typescript
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Check @Public() decorator trước — skip auth hoàn toàn
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),   // method-level decorator
      context.getClass(),     // class-level decorator
    ])
    if (isPublic) return true

    // 2. Extract Bearer token từ Authorization header
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers?.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header')
    }

    // 3. Verify token + optional revocation check
    const token = authHeader.slice(7)
    const decoded = jwt.verify(token, this.authOptions.jwt!.secret)

    if (this.authOptions.jwt!.isRevoked) {
      const revoked = await this.authOptions.jwt!.isRevoked(decoded)
      if (revoked) throw new UnauthorizedException('Token has been revoked')
    }

    // 4. Attach decoded payload → request.user (dùng ở controller sau)
    request.user = decoded
    return true
  }
}
```

**Execution flow của Guards:**

```
Incoming Request
      │
      ▼
Middleware (logging, cors...)
      │
      ▼
Guards [canActivate()]  ← Đây là bước auth
      │ true → tiếp tục
      │ false / throw → 401/403
      ▼
Interceptors (before)
      │
      ▼
Pipes (validation/transform)
      │
      ▼
Controller Handler
      │
      ▼
Interceptors (after)
      │
      ▼
Response
```

### 4.3 RolesGuard — `src/auth/guards/roles.guard.ts`

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // 1. Bỏ qua route @Public()
    // 2. Lấy required roles từ @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [...])

    // 3. Nếu không có @Roles() → không restrict → pass
    if (!requiredRoles || requiredRoles.length === 0) return true

    // 4. Lấy roles của user (customizable via extractRoles)
    const userRoles: string[] = extractRoles(request)

    // 5. User cần có ÍT NHẤT 1 role trong danh sách
    const hasRole = requiredRoles.some((role) => userRoles.includes(role))
    if (!hasRole) throw new ForbiddenException('Insufficient role')
    return true
  }
}
```

### 4.4 ApiKeyGuard — `src/auth/guards/api-key.guard.ts`

Dành cho machine-to-machine auth (cron job, internal service, webhook):

```typescript
@Injectable()
export class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const headerName = this.authOptions.apiKey?.headerName ?? 'x-api-key'
    const apiKey = request.headers?.[headerName]

    if (!apiKey) throw new UnauthorizedException(`Missing ${headerName} header`)

    // Validate logic hoàn toàn do người dùng implement
    const result = await this.authOptions.apiKey!.validate(apiKey)

    if (!result.valid) throw new UnauthorizedException('Invalid API key')

    // Attach permissions từ API key vào request.user
    if (result.permissions) {
      request.user = { permissions: result.permissions }
    }
    return true
  }
}
```

### 4.5 Decorators — `src/auth/decorators.ts`

```typescript
// @Public() — skip toàn bộ auth guards
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

// @Roles('admin', 'manager') — cần BẤT KỲ role nào trong list
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)

// @Permissions('product:read', 'product:write') — cần TẤT CẢ permissions
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions)

// @CurrentUser() — inject user từ request
// @CurrentUser('id') — inject field cụ thể
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user
    return field ? user?.[field] : user
  },
)
```

---

## 5. SECURITY DEMO

### Demo 1: Không có Guard — ai cũng vào được

```typescript
// ❌ Không có guard — bất kỳ ai cũng gọi được
@Get('admin/users')
getAllUsers() {
  return this.userService.findAll()
}
```

Thử ngay:
```bash
curl http://localhost:3000/admin/users
# → 200 OK với full user list — ai cũng lấy được!
```

### Demo 2: Token không có expiry — bị đánh cắp = permanent access

```typescript
// ❌ Nguy hiểm — không có expiresIn
const token = jwt.sign({ sub: 'user123' }, SECRET)
// Token này valid mãi mãi!
// Nếu bị log, bị sniff, bị lộ → hacker dùng được vĩnh viễn
```

```typescript
// ✅ Luôn set expiry
const token = jwt.sign({ sub: 'user123' }, SECRET, { expiresIn: '15m' })
```

### Demo 3: Token không encrypted — kiểm tra ngay

```bash
# Lấy token từ login response
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Decode payload mà không cần secret (chỉ base64)
echo $TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null
# → {"sub":"user123","role":"admin","iat":1234567890,"exp":1234571490}
```

**Kết luận:** Bất kỳ ai có token đều đọc được payload. Không để PII sensitive.

---

## 6. Hands-on: Implement Full Auth Flow

### Step 1: Cài dependencies

```bash
cd my-nestjs-project
npm install jsonwebtoken argon2
npm install @types/jsonwebtoken --save-dev
```

### Step 2: Auth Module với nestjs-boot

```typescript
// app.module.ts
import { BootAuthModule } from 'nestjs-boot'

@Module({
  imports: [
    BootAuthModule.register({
      jwt: {
        secret: process.env.JWT_SECRET!,
        signOptions: { expiresIn: '15m' },
        refreshSecret: process.env.JWT_REFRESH_SECRET!,
        refreshExpiresIn: '7d',
      },
    }),
  ],
})
export class AppModule {}
```

### Step 3: Auth Controller

```typescript
// auth.controller.ts
@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtService: BootJwtService,
    private readonly userService: UserService,
  ) {}

  @Public()                   // ← Không cần token để đăng ký
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const hashedPassword = await argon2.hash(dto.password)
    const user = await this.userService.create({
      email: dto.email,
      password: hashedPassword,
    })
    return { id: user.id, email: user.email }
  }

  @Public()                   // ← Không cần token để đăng nhập
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.userService.findByEmail(dto.email)
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const valid = await argon2.verify(user.password, dto.password)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    const payload = { sub: user.id, email: user.email, roles: user.roles }
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.signRefresh(payload),
    }
  }

  @Public()
  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    // Throws nếu invalid/expired
    const { accessToken, refreshToken: newRefresh } =
      this.jwtService.rotateRefreshToken(refreshToken)
    return { accessToken, refreshToken: newRefresh }
  }

  @Get('profile')             // ← Protected! Cần token hợp lệ
  getProfile(@CurrentUser() user: any) {
    return user
  }
}
```

### Step 4: Protected Routes với RBAC

```typescript
// products.controller.ts
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)   // Apply cả 2 guards
export class ProductsController {

  @Get()
  @Roles('user', 'admin')             // user hoặc admin đều xem được
  findAll() { ... }

  @Post()
  @Roles('admin')                      // Chỉ admin mới tạo được
  create(@Body() dto: CreateProductDto) { ... }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) { ... }
}
```

### Step 5: Test flow

```bash
# 1. Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Secure123!"}'

# 2. Login → lấy tokens
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Secure123!"}'
# → {"accessToken":"eyJ...","refreshToken":"eyJ..."}

# 3. Gọi protected route
TOKEN="eyJ..."
curl http://localhost:3000/products \
  -H "Authorization: Bearer $TOKEN"

# 4. Gọi không có token → 401
curl http://localhost:3000/products
# → 401 Unauthorized

# 5. Refresh
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"eyJ..."}'
```

---

## 7. Bài tập

### Bài tập 1: Change Password (Dễ)

Implement endpoint `POST /auth/change-password`:
- Cần: `currentPassword`, `newPassword`
- Verify current password trước khi đổi
- Re-hash và lưu `newPassword`
- Invalidate toàn bộ refresh tokens cũ (hint: lưu `passwordChangedAt` timestamp, check trong JWT payload)

### Bài tập 2: Forgot Password Flow (Trung bình)

```
1. POST /auth/forgot-password { email }
   → Generate token với jwtService.signPasswordReset(userId, { expiresIn: '15m' })
   → Send email với link: https://app.example.com/reset?token=...

2. POST /auth/reset-password { token, newPassword }
   → jwtService.verifyPasswordReset(token)
   → Hash newPassword → lưu
```

Dùng `BootJwtService.signPasswordReset()` và `verifyPasswordReset()` từ nestjs-boot.

### Bài tập 3: Rate Limit Login (Nâng cao)

Sau 5 lần sai liên tiếp, lock account 15 phút.

Hint:
- Dùng Redis để lưu `failed_login:{email}` counter với TTL 15 phút
- Nếu counter >= 5 → throw `TooManyRequestsException`
- Login thành công → xóa counter

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| `401` dù đúng token | Guard chưa được apply ở global hoặc controller | Check `@UseGuards()` hoặc global setup trong `main.ts` |
| `403` dù đúng role | `extractRoles` function sai — user.roles là `string` thay vì `string[]` | Log `request.user` để debug |
| Token verify thành công nhưng `request.user` là undefined | JwtAuthGuard chưa set `request.user = decoded` | Check guard logic |
| `@Public()` không hoạt động | Guard không check `IS_PUBLIC_KEY` | Đảm bảo dùng guard từ nestjs-boot hoặc check reflector pattern |
| Refresh token verify thất bại | Sign với `secret` nhưng verify với `refreshSecret` (hoặc ngược lại) | Nhất quán: `signRefresh` ↔ `verifyRefresh` |
| JWT không có `exp` → sống mãi | Quên `expiresIn` trong signOptions | Luôn set `expiresIn` |

---

## Câu hỏi tự kiểm tra

1. Nếu Access Token bị đánh cắp, hacker có thể làm gì? Giới hạn bởi điều gì?
2. Tại sao `resetSecret` trong BootJwtService phải khác với `secret`?
3. `@Public()` skip guard bằng cơ chế gì? (`Reflector.getAllAndOverride` hoạt động thế nào?)
4. Nếu user có roles `['user', 'manager']` và route `@Roles('admin', 'manager')`, user có vào được không? Tại sao?
5. API Key auth phù hợp cho scenario nào mà JWT không phù hợp?

---

## Đọc thêm

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [RFC 7519 — JSON Web Token](https://tools.ietf.org/html/rfc7519)
- [Have I Been Pwned — học từ các vụ rò rỉ thực tế](https://haveibeenpwned.com/Passwords)
- Source: `src/auth/services/jwt.service.ts`, `src/auth/guards/`, `src/auth/decorators.ts`
- Tests: `tests/auth/jwt.service.spec.ts`, `tests/auth/guards/`
