# Tuần 14: Security

> **Stage 4 — Production | nestjs-boot Teaching Series**
> Prerequisite: Đã hoàn thành Tuần 13 (CI/CD & DevOps)

---

## Mục tiêu học tập

Sau tuần này, sinh viên có thể:

1. Nhận diện và giải thích 10 lỗ hổng trong OWASP Top 10 (2021) với ví dụ NestJS cụ thể
2. Phân tích case study path traversal thực tế trong `LocalAdapter` của nestjs-boot
3. Viết input validation đúng cách với `class-validator`
4. Cấu hình security headers với Helmet và CORS
5. Implement rate limiting chống brute force
6. Tìm và vá lỗ hổng trong bài CTF

---

## Triết lý bảo mật: "Security is not a feature, it's a property"

Nhiều developer nghĩ security là tính năng thêm vào sau cùng. Sai. Security là **thuộc tính của toàn bộ hệ thống** — nó phải được xem xét ở TỪNG quyết định thiết kế, TỪNG dòng code.

> "Security is not something you bolt on. It's something you bake in." — Ross Anderson

**Hậu quả của việc "bolt on" security:**

| Lỗ hổng | Chi phí fix sớm | Chi phí fix sau production |
|---------|-----------------|---------------------------|
| Path traversal trong file upload | 1 dòng code | Audit toàn bộ uploaded files, notify users, patch, PR review... |
| SQL Injection | Dùng ORM đúng cách | Potential data breach + GDPR fine |
| Missing auth guard | 1 decorator | Investigate what data was accessed |

---

## 1. OWASP Top 10 (2021)

OWASP (Open Web Application Security Project) publish danh sách 10 lỗ hổng phổ biến nhất hàng năm. Đây là **tiêu chuẩn ngành** — mọi security audit đều check danh sách này.

---

### A01: Broken Access Control (Kiểm soát truy cập bị hỏng)

**Là gì?** User có thể thực hiện hành động hoặc truy cập dữ liệu NGOÀI quyền của họ.

**Ví dụ phổ biến trong NestJS:**

**1. Missing guard:**
```typescript
// ❌ SAI: Không có guard → ai cũng gọi được
@Delete(':id')
async deleteUser(@Param('id') id: string) {
  return this.usersService.delete(id);
}

// ✅ ĐÚNG:
@Delete(':id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
async deleteUser(@Param('id') id: string) {
  return this.usersService.delete(id);
}
```

**2. IDOR (Insecure Direct Object Reference):**
```typescript
// ❌ SAI: User A có thể đọc order của User B
@Get('orders/:id')
@UseGuards(JwtAuthGuard)
async getOrder(@Param('id') id: string) {
  return this.ordersService.findById(id);  // Không check ownership!
}

// ✅ ĐÚNG: Verify ownership
@Get('orders/:id')
@UseGuards(JwtAuthGuard)
async getOrder(@Param('id') id: string, @CurrentUser() user: User) {
  const order = await this.ordersService.findById(id);
  if (order.userId !== user.id) {
    throw new ForbiddenException('Access denied');
  }
  return order;
}
```

**Prevention:**
- Luôn verify resource ownership, không chỉ authentication
- Dùng UUIDs thay vì sequential IDs (khó đoán hơn nhưng KHÔNG phải security)
- Test IDOR: dùng account A tạo resource, dùng account B cố truy cập

---

### A02: Cryptographic Failures (Lỗi mã hóa)

**Là gì?** Dữ liệu nhạy cảm không được bảo vệ đúng cách.

**Ví dụ trong NestJS:**

```typescript
// ❌ SAI 1: Lưu password plaintext
async createUser(dto: CreateUserDto) {
  return this.userModel.create({ ...dto, password: dto.password });
}

// ❌ SAI 2: Dùng MD5/SHA1 (đã bị crack)
const hash = crypto.createHash('md5').update(password).digest('hex');

// ❌ SAI 3: JWT không có expiry
const token = jwt.sign({ userId }, secret);  // Không expires!

// ✅ ĐÚNG: bcrypt + JWT có expiry
import * as bcrypt from 'bcrypt';

const hash = await bcrypt.hash(password, 12);  // cost factor 12

const token = jwt.sign({ userId }, secret, { expiresIn: '15m' });
```

**Các nguyên tắc:**
- Password → `bcrypt` (cost ≥ 10) hoặc `argon2`
- Sensitive data at rest → AES-256-GCM
- Transport → TLS 1.2+ (HTTPS)
- JWT → có `exp`, có `iat`, dùng RS256 cho production

---

### A03: Injection (Tấn công tiêm)

**Là gì?** Attacker inject code/commands vào query của ứng dụng.

**NoSQL Injection trong MongoDB:**

```typescript
// ❌ SAI: Nhận trực tiếp từ request body
@Post('login')
async login(@Body() body: any) {
  const user = await this.userModel.findOne({
    email: body.email,
    password: body.password  // NGUY HIỂM!
  });
}
```

Attacker gửi:
```json
{
  "email": "admin@example.com",
  "password": { "$ne": null }
}
```

MongoDB query trở thành:
```js
{ email: 'admin@example.com', password: { $ne: null } }
// → Tìm user có email này VÀ password khác null → LUÔN MATCH!
```

```typescript
// ✅ ĐÚNG: Validate và sanitize input
@Post('login')
async login(@Body() dto: LoginDto) {
  // LoginDto validate với class-validator:
  // @IsEmail() email: string
  // @IsString() @MinLength(8) password: string
  const user = await this.userModel.findOne({ email: dto.email });
  const isValid = await bcrypt.compare(dto.password, user.passwordHash);
  // ...
}
```

**Command Injection:**
```typescript
// ❌ SAI: Dùng shell với user input
const { exec } = require('child_process');
exec(`convert ${userFilename} output.pdf`);  // NGUY HIỂM!

// Attacker gửi: filename = "file.jpg; rm -rf /"

// ✅ ĐÚNG: Dùng execFile với args array (không qua shell)
const { execFile } = require('child_process');
execFile('convert', [userFilename, 'output.pdf']);  // Safe
```

---

### A04: Insecure Design (Thiết kế không an toàn)

**Là gì?** Lỗ hổng xuất phát từ thiết kế, không phải implementation.

**Mass Assignment:**
```typescript
// ❌ SAI: Cho phép update bất kỳ field nào
@Patch(':id')
async updateUser(@Param('id') id: string, @Body() body: any) {
  return this.userModel.findByIdAndUpdate(id, body);
  // Attacker gửi: { "role": "admin" }
}

// ✅ ĐÚNG: Whitelist fields được phép update
class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  // KHÔNG có 'role', 'isAdmin', 'email'
}

@Patch(':id')
async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
  return this.userModel.findByIdAndUpdate(id, dto);
}
```

**Excessive Data Exposure:**
```typescript
// ❌ SAI: Trả về toàn bộ document (bao gồm passwordHash, internalNotes)
async getUser(id: string) {
  return this.userModel.findById(id);
}

// ✅ ĐÚNG: Chỉ trả về fields cần thiết
async getUser(id: string) {
  return this.userModel.findById(id).select('-passwordHash -internalNotes -__v');
}
```

---

### A05: Security Misconfiguration (Cấu hình bảo mật sai)

**Là gì?** Default settings, verbose errors, exposed debug endpoints.

**Verbose errors trong production:**
```typescript
// ❌ SAI: Stack trace lộ ra client
app.useGlobalFilters(new AllExceptionsFilter());  // Trả về stack trace đầy đủ

// ✅ ĐÚNG: Ẩn internal details trong production
@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const isProduction = process.env.NODE_ENV === 'production';
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      message: isProduction && status === 500
        ? 'Internal server error'  // Ẩn details
        : (exception as any).message,
      // KHÔNG bao giờ trả stack trace về client
    });
  }
}
```

**Default credentials:**
```yaml
# ❌ SAI: Dùng trong production
environment:
  JWT_SECRET: dev-secret-change-in-production
  # Đây là lỗi thực tế trong docker-compose.yml của nestjs-boot!
  # File này là cho DEVELOPMENT, không phải production
```

---

### A06: Vulnerable and Outdated Components

**Là gì?** Dùng dependencies có CVE (lỗ hổng đã biết).

```bash
# Kiểm tra dependencies
npm audit

# Output quan trọng:
# - Tên package
# - CVE ID
# - Severity (critical/high/moderate/low)
# - Path (direct hay transitive dependency)
# - Fix version

# Fix tự động
npm audit fix

# Fix kể cả breaking changes (cẩn thận)
npm audit fix --force
```

**Dependabot:** GitHub tự động mở PR khi có security update:
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
```

---

### A07: Identification and Authentication Failures

**Là gì?** Brute force, credential stuffing, weak tokens.

**Rate limiting để chống brute force:**
```typescript
// npm install @nestjs/throttler
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      name: 'short',
      ttl: 60000,    // 1 phút
      limit: 10,     // Tối đa 10 requests/phút
    }]),
  ],
})
export class AppModule {}

// Áp dụng chặt hơn cho login endpoint
@Post('login')
@Throttle({ default: { limit: 5, ttl: 60000 } })  // 5 lần/phút
async login(@Body() dto: LoginDto) { ... }
```

---

### A08: Software and Data Integrity Failures

**Là gì?** Không verify integrity của data trước khi dùng (deserialization attacks, CI/CD pipeline injection).

```typescript
// Luôn validate webhook payloads bằng signature
@Post('webhook/payment')
async handlePaymentWebhook(
  @Headers('x-stripe-signature') signature: string,
  @RawBody() payload: Buffer,
) {
  // Verify signature TRƯỚC khi process
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
    await this.handleStripeEvent(event);
  } catch (err) {
    throw new BadRequestException('Invalid webhook signature');
  }
}
```

---

### A09: Security Logging and Monitoring Failures

**Là gì?** Không log các sự kiện security → không phát hiện attack.

**Các sự kiện PHẢI log:**
```typescript
@Post('login')
async login(@Body() dto: LoginDto, @Req() req: Request) {
  try {
    const user = await this.authService.validateUser(dto);
    this.logger.log({
      event: 'AUTH_SUCCESS',
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return this.authService.generateToken(user);
  } catch (err) {
    // ✅ Log failed attempts với IP để detect brute force
    this.logger.warn({
      event: 'AUTH_FAILURE',
      email: dto.email,
      ip: req.ip,
      reason: err.message,
    });
    throw new UnauthorizedException();
  }
}
```

---

### A10: Server-Side Request Forgery (SSRF)

**Là gì?** Server thực hiện HTTP request đến URL do attacker kiểm soát → có thể truy cập internal services.

```typescript
// ❌ SAI: Fetch URL từ user input không validate
@Post('preview')
async preview(@Body('url') url: string) {
  const response = await fetch(url);  // Attacker gửi http://169.254.169.254/...
  return response.text();              // AWS metadata service!
}

// ✅ ĐÚNG: Whitelist domains
const ALLOWED_DOMAINS = ['api.trusted-partner.com', 'cdn.myapp.com'];

@Post('preview')
async preview(@Body('url') url: string) {
  const parsed = new URL(url);
  if (!ALLOWED_DOMAINS.includes(parsed.hostname)) {
    throw new BadRequestException('Domain not allowed');
  }
  const response = await fetch(url);
  return response.text();
}
```

---

## 2. Case Study Thực Tế: Path Traversal trong nestjs-boot

### 2.1 Bối cảnh

File: `src/storage/adapters/local.adapter.ts`

`LocalAdapter` cho phép upload và download files. Nếu không validate path, attacker có thể đọc bất kỳ file nào trên server bằng cách gửi key như `../../etc/passwd`.

### 2.2 Phân tích safePath()

```typescript
// src/storage/adapters/local.adapter.ts

/** Resolve key to a safe absolute path within uploadDir. Throws on traversal. */
private safePath(key: string): string {
  const resolved = resolve(this.uploadDir, key);
  // resolve('/uploads', '../../etc/passwd') → '/etc/passwd'

  if (!resolved.startsWith(resolve(this.uploadDir) + '/') &&
      resolved !== resolve(this.uploadDir)) {
    throw new Error('Path traversal detected');
    // '/etc/passwd'.startsWith('/uploads/') → FALSE → throw!
  }
  return resolved;
  // resolve('/uploads', 'images/photo.jpg') → '/uploads/images/photo.jpg' → OK
}
```

**Bước giải quyết:**
1. `resolve(uploadDir, key)` → tính đường dẫn tuyệt đối (xử lý `../`)
2. Check xem kết quả có nằm TRONG `uploadDir` không
3. Nếu không → throw ngay

### 2.3 Lỗ hổng cũ (trước khi fix)

Hãy tưởng tượng phiên bản cũ của code KHÔNG dùng `safePath()`:

```typescript
// Phiên bản CŨ (VULNERABLE):
async download(key: string): Promise<Buffer> {
  const { readFile } = await import('fs/promises');
  const filePath = join(this.uploadDir, key);  // Không validate!
  return readFile(filePath);
}

async delete(key: string): Promise<void> {
  const { unlink } = await import('fs/promises');
  const filePath = join(this.uploadDir, key);  // Không validate!
  await unlink(filePath);
}
```

Attacker request:
```http
GET /files/download?key=../../etc/passwd
DELETE /files/../../app/.env
```

### 2.4 Fix: safePath() áp dụng cho MỌI method

```typescript
// Phiên bản ĐÚNG (hiện tại trong nestjs-boot):
async upload(file: UploadedFile): Promise<StorageResult> {
  const key = generateStorageKey(file.originalName, file.folder);
  const dest = this.safePath(key);  // ✅ safePath
  // ...
}

async download(key: string): Promise<Buffer> {
  const filePath = this.safePath(key);  // ✅ safePath
  return readFile(filePath);
}

async delete(key: string): Promise<void> {
  const filePath = this.safePath(key);  // ✅ safePath
  await unlink(filePath);
}

async exists(key: string): Promise<boolean> {
  const filePath = this.safePath(key);  // ✅ safePath
  // ...
}

async getUrl(key: string): Promise<string> {
  // getUrl không access filesystem → không cần safePath ở đây
  // nhưng serve endpoint phải validate
  return `${this.basePath}/${key}`;
}
```

### 2.5 Bài học

> **"Security must be applied EXHAUSTIVELY, not incrementally."**

Nếu `safePath()` chỉ được áp dụng cho `upload()` mà quên `download()`, `delete()`, `exists()` → vẫn bị tấn công. Security không phải "fix một chỗ rồi xong" — **mỗi method tiếp nhận user input đều phải được bảo vệ**.

**Quy trình đúng:**
1. Tạo utility function bảo mật (`safePath()`)
2. **Search toàn bộ codebase** tìm tất cả chỗ dùng `join(uploadDir, ...)` hoặc `resolve(uploadDir, ...)`
3. Replace TẤT CẢ bằng `safePath()`
4. Viết negative test để verify:

```typescript
// Test path traversal bị chặn
it('should throw on path traversal', async () => {
  const adapter = new LocalAdapter('/uploads');
  await expect(adapter.download('../../etc/passwd')).rejects.toThrow('Path traversal detected');
  await expect(adapter.download('../../../proc/self/environ')).rejects.toThrow('Path traversal detected');
  await expect(adapter.download('%2e%2e%2fetc%2fpasswd')).rejects.toThrow(); // URL encoded
});

it('should allow normal keys', async () => {
  // Không throw
  await expect(adapter.exists('images/photo.jpg')).resolves.toBeDefined();
});
```

---

## 3. Input Validation as Security

### 3.1 class-validator + class-transformer

NestJS dùng `ValidationPipe` global để validate tất cả input:

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,        // Tự động strip fields không có trong DTO
  forbidNonWhitelisted: true,  // Throw nếu có field lạ
  transform: true,        // Auto-transform types (string → number)
  transformOptions: {
    enableImplicitConversion: true,
  },
}));
```

```typescript
// create-user.dto.ts
import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase and number',
  })
  password: string;

  // Không có 'role' → whitelist: true sẽ strip nó ra
}
```

### 3.2 Sanitization

```typescript
import * as sanitizeHtml from 'sanitize-html';

// Nếu cần lưu HTML (e.g., blog content)
const clean = sanitizeHtml(userInput, {
  allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'],
  allowedAttributes: {},  // Không cho attributes để chặn event handlers
});
```

---

## 4. Security Headers với Helmet

```typescript
// main.ts
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  // Tự động thêm:
  // X-Content-Type-Options: nosniff
  // X-Frame-Options: DENY
  // X-XSS-Protection: 1; mode=block
  // Strict-Transport-Security: max-age=15552000
  // Content-Security-Policy: default-src 'self'
  // ...

  // CORS configuration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(3000);
}
```

---

## 5. CTF-style Exercises

### Exercise 1: NoSQL Injection trong Login

**Code có lỗ hổng:**
```typescript
@Post('login')
async login(@Body() body: any) {
  const user = await this.userModel.findOne({
    email: body.email,
    password: body.password,
  });
  if (!user) throw new UnauthorizedException();
  return { token: this.jwtService.sign({ sub: user._id }) };
}
```

**Nhiệm vụ:**
1. Tìm payload để bypass authentication mà không biết password
2. Fix lỗ hổng (2 bước: validate input + hash password đúng cách)
3. Viết test chứng minh fix đúng

**Gợi ý:** MongoDB operators trong request body.

---

### Exercise 2: Path Traversal trong File Upload

**Code có lỗ hổng:**
```typescript
@Get('files/:filename')
async downloadFile(@Param('filename') filename: string, @Res() res: Response) {
  const filePath = path.join('/app/uploads', filename);
  res.sendFile(filePath);
}
```

**Nhiệm vụ:**
1. Craft request để đọc `/etc/passwd`
2. Fix bằng cách implement `safePath()` tương tự nestjs-boot
3. Test: `GET /files/../../etc/passwd` phải return 400

---

### Exercise 3: IDOR

**Code có lỗ hổng:**
```typescript
@Get('orders/:id')
@UseGuards(JwtAuthGuard)
async getOrder(@Param('id') id: string) {
  return this.ordersService.findById(id);  // Không check ownership!
}
```

**Nhiệm vụ:**
1. Tạo 2 user accounts
2. Dùng account A, lấy order ID của account B
3. Dùng token của account A, request `GET /orders/{order_B_id}` → thành công (đây là bug)
4. Fix: thêm ownership check
5. Test: account A request order của B → 403

---

### Exercise 4: JWT Vulnerabilities

**Code có lỗ hổng:**
```typescript
const token = this.jwtService.sign({ sub: user.id });
// Không có expiresIn!
```

**Nhiệm vụ:**
1. Generate token, decode nó (jwt.io), xem không có `exp` field
2. Implement refresh token flow với:
   - Access token: 15 phút
   - Refresh token: 7 ngày, stored in DB
3. Implement token revocation: blacklist refresh tokens khi logout
4. Test: sau logout, refresh token cũ phải bị từ chối

---

## 6. Hands-on: Audit your own API

**Checklist OWASP cho NestJS project:**

```markdown
## Security Audit Checklist

### Authentication & Authorization
- [ ] Tất cả endpoints cần auth đều có @UseGuards(JwtAuthGuard)
- [ ] Resource ownership được verify (không chỉ authentication)
- [ ] JWT có expiresIn
- [ ] Password hash bằng bcrypt (cost ≥ 10)
- [ ] Login endpoint có rate limiting

### Input Validation
- [ ] ValidationPipe global với whitelist: true
- [ ] Tất cả DTOs dùng class-validator decorators
- [ ] File upload validate MIME type và size

### Configuration
- [ ] Không có hardcoded secrets
- [ ] NODE_ENV production ẩn stack traces
- [ ] Helmet được cài đặt
- [ ] CORS chỉ cho phép specific origins

### Dependencies
- [ ] npm audit không có high/critical vulnerabilities

### Logging
- [ ] Auth success/failure được log
- [ ] Không log passwords hay tokens
```

---

## 7. Lỗi thường gặp

| Lỗi | Impact | Fix |
|-----|--------|-----|
| Quên `@UseGuards` trên 1 endpoint | Full data breach | Review toàn bộ controllers, test IDOR |
| `ValidationPipe` thiếu `whitelist: true` | Mass assignment | Thêm option, test với extra fields |
| JWT không có `expiresIn` | Token never expires | Luôn set `expiresIn`, implement refresh |
| Log password trong error | Credential exposure | Sanitize log data, dùng `nestjs-cls` |
| `npm audit` chạy nhưng không fail CI khi có issues | CVEs không được fix | Thêm `--audit-level=high` |
| Stack trace trong production response | Information disclosure | Custom ExceptionFilter cho production |

---

## 8. Câu hỏi tự kiểm tra

1. IDOR là gì? Tại sao JWT authentication KHÔNG đủ để ngăn IDOR?
2. `whitelist: true` trong `ValidationPipe` làm gì? Tại sao quan trọng?
3. Tại sao `resolve(uploadDir, key)` an toàn hơn `join(uploadDir, key)` khi check path traversal?
4. Bạn nên log gì khi login thất bại? Bạn KHÔNG nên log gì?
5. Sự khác biệt giữa authentication và authorization?
6. Tại sao `bcrypt` tốt hơn MD5 để hash password?
7. Rate limiting protect against gì? Nó có prevent IDOR không?

---

## 9. Đọc thêm

- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [OWASP NestJS Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/NodeJS_Security_Cheat_Sheet.html)
- [NestJS Security Documentation](https://docs.nestjs.com/security/helmet)
- [JWT Security Best Practices](https://curity.io/resources/learn/jwt-best-practices/)
- nestjs-boot source: `src/storage/adapters/local.adapter.ts`, `src/auth/guards/`
- [HackTricks Web Hacking](https://book.hacktricks.xyz/pentesting-web) (để học attacker mindset)
