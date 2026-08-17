# Tuần 4: Config & Environment Management

> **Giai đoạn:** Stage 1 — Nền tảng | **Tuần:** 4/4 — MILESTONE 1
> **Thời lượng:** 3 giờ (45 phút lý thuyết + 75 phút thực hành + 60 phút milestone)
> **Yêu cầu đầu vào:** Tuần 1-3 hoàn chỉnh — CRUD API với MongoDB + validation

---

## Mục tiêu học tập

Sau buổi này, sinh viên sẽ có thể:

1. Giải thích 12-Factor App methodology và tại sao quan trọng
2. Phân biệt configuration, secrets, và hard-coded values
3. Setup `.env` + validation fail-fast với Joi
4. Dùng `BootConfigModule` và `BootConfigService` từ nestjs-boot
5. Cấu hình nhiều môi trường (dev / staging / production) đúng cách
6. Hoàn thành Milestone 1 project

---

## Phần 1: 12-Factor App — Phương pháp build app hiện đại (20 phút)

### 1.1 Background

Năm 2011, Heroku (cloud platform) publish [The Twelve-Factor App](https://12factor.net/) — 12 nguyên tắc để build app dễ deploy, scale, maintain. Đây là nền tảng cho DevOps, cloud-native, microservices.

Chúng ta sẽ tập trung vào những factor quan trọng nhất cho backend developer.

### 1.2 Factor III: Config — Lưu config trong environment, không trong code

**Vấn đề kinh điển:**

```typescript
// ❌ Hard-coded trong code
const connection = mongoose.connect('mongodb://admin:mySecret123@prod.db.company.com:27017/app');
const jwtSecret = 'super-secret-key-do-not-share';
const apiKey = 'sk-proj-abc123def456';

// Vấn đề:
// 1. Commit lên GitHub → bất kỳ ai fork repo đều thấy password
// 2. Dev env và prod env có DB khác nhau → phải sửa code mỗi lần deploy
// 3. Rotate secret → phải sửa code, commit, deploy
```

**Giải pháp đúng:**

```bash
# .env (KHÔNG commit vào git)
MONGODB_URI=mongodb://admin:password@localhost:27017/student_db?authSource=admin
JWT_SECRET=32-character-minimum-secret-key-for-security
PORT=3000
NODE_ENV=development

# .env.production (trên server — không bao giờ trong repo)
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<db>
JWT_SECRET=<generate-with-openssl-rand-base64-32>
PORT=8080
NODE_ENV=production
```

```typescript
// ✅ Đọc từ environment
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
```

**Kết quả:** Cùng 1 codebase, deploy nhiều môi trường chỉ bằng cách đổi biến môi trường.

### 1.3 Factor I: Codebase — 1 repo, nhiều deploys

```
1 Git Repository
     ↓
Development env    (LOCAL — dev laptop)
Staging env        (SERVER — test trước khi release)
Production env     (SERVER — user thật)
```

Mỗi môi trường có biến môi trường khác nhau, nhưng chạy CÙNG code.

### 1.4 Factor XI: Logs — Treat logs as event streams

```typescript
// ❌ Sai — ghi log ra file
import * as fs from 'fs';
fs.appendFileSync('app.log', `Error: ${message}\n`);

// ✅ Đúng — ghi ra stdout/stderr, để platform xử lý
console.log('Info:', message);
console.error('Error:', error);
// NestJS Logger cũng ghi ra stdout — đúng cách
```

### 1.5 Factor VI: Processes — Stateless

```typescript
// ❌ Sai — lưu state trong process memory
let sessionData = {}; // Mất khi restart, không share giữa nhiều instances

// ✅ Đúng — state trong external store (Redis, DB)
// Sessions → Redis
// Files → S3/R2/MinIO
// Cache → Redis
```

---

## Phần 2: Environment Variables — Chi tiết (20 phút)

### 2.1 Thứ tự ưu tiên

```
System environment variables (highest priority)
           ↓
.env.production / .env.development
           ↓
.env.local (personal overrides, never commit)
           ↓
.env (default values)
           ↓
Hard-coded defaults in code (lowest priority)
```

### 2.2 .env file conventions

```bash
# .env — Template với placeholder values (COMMIT VÀO GIT)
# Để team biết cần những biến gì, nhưng không lộ giá trị thật

# Server
NODE_ENV=development
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/student_db_dev

# Auth (minimum 32 chars!)
JWT_SECRET=CHANGE_ME_TO_A_REAL_32_CHAR_SECRET
JWT_EXPIRES_IN=7d

# External services (không điền giá trị thật ở đây)
SENDGRID_API_KEY=
STRIPE_SECRET_KEY=
```

```bash
# .env.local — Giá trị thật của bạn (KHÔNG BAO GIỜ COMMIT)
JWT_SECRET=my-actual-very-long-secret-32-chars-min

# .gitignore
.env.local
.env.production
.env.staging
```

```bash
# .gitignore — bắt buộc có những dòng này
.env.local
.env.*.local
.env.production
.env.staging
*.pem           # SSL certificates
*.key           # Private keys
credentials/    # Thư mục chứa credentials
```

### 2.3 Secrets — Không phải mọi secret đều là env var

| Loại | Cách quản lý |
|------|-------------|
| Dev secrets (cá nhân) | `.env.local` — không commit |
| Team shared secrets | Password manager (1Password, Bitwarden) |
| CI/CD secrets | GitHub Actions Secrets, GitLab CI Variables |
| Production secrets | AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager |

**nestjs-boot hỗ trợ async loading từ Vault:**

```typescript
// src/config/config.module.ts trong nestjs-boot
BootConfigModule.registerAsync({
  imports: [VaultModule],
  inject: [VaultService],
  useFactory: async (vault: VaultService) => {
    const secrets = await vault.getSecrets('student-service');
    return {
      database: {
        connections: {
          master: { writerUri: secrets.MONGODB_URI },
        },
      },
    };
  },
})
```

### 2.4 Config validation — Fail fast, không fail slow

**Vấn đề:** App khởi động thành công, nhưng crash khi có request đầu tiên vì thiếu config.

```typescript
// ❌ Validate quá muộn — lỗi xuất hiện lúc runtime
async findAll() {
  const mongoUri = process.env.MONGODB_URI; // Undefined → crash khi kết nối
  // ...
}

// ✅ Validate khi khởi động — fail ngay, fail rõ ràng
// App sẽ không start nếu thiếu config bắt buộc
```

**nestjs-boot thực hiện validate ngay khi load module:**

```typescript
// src/config/config.module.ts
static register(options: BootOptions): DynamicModule {
  const validated = validateBootOptions(options); // Throw ngay nếu invalid!
  // ...
}
```

---

## Phần 3: nestjs-boot Config System (20 phút)

### 3.1 BootOptions — Typed configuration

nestjs-boot định nghĩa `BootOptions` interface cho toàn bộ config của framework. Xem `src/interfaces/boot-options.interface.ts`:

```typescript
// Trích từ boot-options.interface.ts

export interface ConnectionOptions {
  writerUri: string;         // MongoDB URI bắt buộc
  readerUri?: string;        // Read replica — optional
  options?: MongooseConnectionOptions; // Pool size, timeouts, etc.
}

export interface DatabaseOptions {
  connections: Record<string, ConnectionOptions>; // Nhiều DB connections
}

export interface BootOptions {
  database?: DatabaseOptions;
  cache?: CacheOptions;
  response?: ResponseOptions;
  health?: HealthOptions;
  auth?: AuthOptions;
  // ...
}
```

**Tại sao typed config quan trọng:**

```typescript
// Không typed:
const uri = process.env.MONGODB_URI; // string | undefined — dễ miss

// Typed với BootConfigService:
const uri = configService.get('database.connections.master.writerUri');
// TypeScript biết kiểu, IDE autocomplete, compile-time check
```

### 3.2 Joi validation trong nestjs-boot

File `src/config/validators.ts` dùng Joi để validate BootOptions:

```typescript
// Trích từ src/config/validators.ts
const connectionSchema = Joi.object({
  writerUri: Joi.string()
    .uri()
    .pattern(/^mongodb(\+srv)?:\/\//)
    .required()
    .messages({
      'string.uri': 'writerUri phải là MongoDB URI hợp lệ',
      'any.required': 'writerUri là bắt buộc',
    }),
  readerUri: Joi.string()
    .uri()
    .pattern(/^mongodb(\+srv)?:\/\//)
    .optional(),
});

// JWT secret phải có ít nhất 32 chars (HMAC-SHA256 minimum)
secret: Joi.string()
  .min(32)
  .required()
  .label('jwt.secret (min 32 chars for HMAC-SHA256)'),
```

**Khi validation fail, app không start và báo lỗi rõ:**

```
Error: [nestjs-boot] Config validation failed:
  - database.connections.master.writerUri: writerUri phải là MongoDB URI hợp lệ
  - auth.jwt.secret: jwt.secret (min 32 chars for HMAC-SHA256) is required
```

### 3.3 BootConfigService — Typed access

File `src/config/config.service.ts` cung cấp typed access với dot-notation:

```typescript
@Injectable()
export class BootConfigService {
  // Dot-notation với TypeScript autocomplete
  get<T = unknown>(path: BootConfigPath | (string & {})): T | undefined

  // Throw nếu không tồn tại
  getOrThrow<T = unknown>(path: BootConfigPath | (string & {})): T

  // Lấy section
  section<K extends keyof BootOptions>(key: K): BootOptions[K]
}
```

```typescript
// Sử dụng trong service:
@Injectable()
export class EmailService {
  constructor(private readonly config: BootConfigService) {}

  async sendWelcome(email: string) {
    // Autocomplete: "database.connections...." etc.
    const dbUri = this.config.get('database.connections.master.writerUri');

    // Lấy cả section
    const authConfig = this.config.section('auth');
    const jwtSecret = authConfig?.jwt?.secret;
  }
}
```

---

## Phần 4: Hands-on — Setup Config đúng chuẩn (45 phút)

### Bước 1: Tạo typed AppConfig

Tạo config riêng cho app (ngoài nestjs-boot BootOptions):

```typescript
// src/config/app-config.interface.ts
export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'staging' | 'production' | 'test';
  mongodb: {
    uri: string;
    readerUri?: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  cors: {
    origins: string[];
  };
  rateLimit: {
    windowMs: number;  // ms
    max: number;       // requests per window
  };
}
```

### Bước 2: Validation schema với Joi

```bash
npm install joi
```

```typescript
// src/config/config.validation.ts
import * as Joi from 'joi';

export const appConfigSchema = Joi.object({
  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),

  MONGODB_URI: Joi.string()
    .pattern(/^mongodb(\+srv)?:\/\//)
    .required()
    .messages({
      'string.pattern.base': 'MONGODB_URI phải bắt đầu bằng mongodb:// hoặc mongodb+srv://',
      'any.required': 'MONGODB_URI là bắt buộc',
    }),

  MONGODB_READER_URI: Joi.string()
    .pattern(/^mongodb(\+srv)?:\/\//)
    .optional(),

  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .messages({
      'string.min': 'JWT_SECRET phải có ít nhất 32 ký tự',
      'any.required': 'JWT_SECRET là bắt buộc',
    }),

  JWT_EXPIRES_IN: Joi.string().default('7d'),

  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(60000),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(100),
});

export function validateConfig(config: Record<string, unknown>) {
  const { error, value } = appConfigSchema.validate(config, {
    abortEarly: false,   // Báo TẤT CẢ lỗi, không dừng ở lỗi đầu tiên
    allowUnknown: true,  // Cho phép env vars khác (từ OS)
    stripUnknown: false, // Giữ lại env vars không trong schema
  });

  if (error) {
    const details = error.details.map(d => `  - ${d.message}`).join('\n');
    throw new Error(`Config validation failed:\n${details}`);
  }

  return value;
}
```

### Bước 3: Config factory function

```typescript
// src/config/configuration.ts
import { AppConfig } from './app-config.interface';

export function configuration(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) || 'development',
    mongodb: {
      uri: process.env.MONGODB_URI!,
      readerUri: process.env.MONGODB_READER_URI,
    },
    jwt: {
      secret: process.env.JWT_SECRET!,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    cors: {
      origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
  };
}
```

### Bước 4: Config module

```typescript
// src/config/app-config.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { configuration } from './configuration';
import { validateConfig } from './config.validation';

export const APP_CONFIG = 'APP_CONFIG';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateConfig, // Validate khi module load
      expandVariables: true,    // Support ${OTHER_VAR} references
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (configService: ConfigService) => configService.get<AppConfig>('') || configuration(),
      inject: [ConfigService],
    },
  ],
  exports: [APP_CONFIG, ConfigModule],
})
export class AppConfigModule {}
```

### Bước 5: Sử dụng config trong service

```typescript
// src/students/students.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config.module';
import { AppConfig } from '../config/app-config.interface';

@Injectable()
export class StudentsService {
  constructor(
    private readonly repo: StudentsRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async findAll(query: QueryStudentDto) {
    // Config-driven behavior
    const limit = Math.min(query.limit ?? 20, this.config.rateLimit.max);
    return this.repo.findWithFilter(/* ... */, query.page, limit);
  }
}
```

### Bước 6: Multiple environments

```bash
# .env.development
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password@localhost:27017/student_db_dev?authSource=admin
JWT_SECRET=dev-only-secret-not-used-in-production-32c
JWT_EXPIRES_IN=30d    # Dài hơn để dev tiện test
CORS_ORIGINS=http://localhost:3000,http://localhost:4200
RATE_LIMIT_MAX=1000   # Loose hơn để dev test dễ
```

```bash
# .env.staging
NODE_ENV=staging
PORT=8080
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/student_db_staging
JWT_SECRET=staging-secret-32-chars-minimum-required
JWT_EXPIRES_IN=7d
CORS_ORIGINS=https://staging.student-api.com
RATE_LIMIT_MAX=200
```

```bash
# .env.production
NODE_ENV=production
PORT=8080
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/student_db_prod
MONGODB_READER_URI=mongodb+srv://<user>:<password>@<replica>.mongodb.net/student_db_prod
JWT_SECRET=production-very-long-random-secret-at-least-64-chars-recommended
JWT_EXPIRES_IN=7d
CORS_ORIGINS=https://api.student.com
RATE_LIMIT_MAX=100
```

### Bước 7: Load .env file theo NODE_ENV

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { resolve } from 'path';

async function bootstrap() {
  // Load env file trước khi tạo app
  const envFile = process.env.NODE_ENV === 'production'
    ? '.env.production'
    : process.env.NODE_ENV === 'staging'
    ? '.env.staging'
    : '.env.development';

  config({ path: resolve(process.cwd(), envFile) });
  // Fallback: .env
  config({ path: resolve(process.cwd(), '.env') });

  const app = await NestFactory.create(AppModule);
  // ...
  await app.listen(process.env.PORT || 3000);
}
```

```bash
# Khởi động với env khác nhau
NODE_ENV=development npm run start:dev
NODE_ENV=staging npm run start
NODE_ENV=production npm run start:prod
```

### Bước 8: nestjs-boot BootConfigModule (cho framework features)

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { BootModule } from 'nestjs-boot';
import { StudentsModule } from './students/students.module';
import { AppConfigModule } from './config/app-config.module';

@Module({
  imports: [
    // Config của app (tuần này xây)
    AppConfigModule,

    // nestjs-boot features với typed config + validation
    BootModule.register({
      database: {
        connections: {
          master: {
            writerUri: process.env.MONGODB_URI!,
            readerUri: process.env.MONGODB_READER_URI,
            options: {
              maxPoolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
              serverSelectionTimeoutMS: 5000,
            },
          },
        },
      },
      response: {
        envelope: true,  // Wrap responses
        errorHandler: true,
      },
      health: {
        enabled: true,
        path: '/health',
      },
    }),

    StudentsModule,
  ],
})
export class AppModule {}
```

---

## Phần 5: Lỗi thường gặp

### Lỗi 1: "Config validation failed" khi start

```
Error: Config validation failed:
  - MONGODB_URI: "MONGODB_URI" is required
```

**Nguyên nhân:** Biến môi trường chưa được set.

**Checklist:**
```bash
# 1. Kiểm tra file .env tồn tại
ls -la .env*

# 2. Kiểm tra biến đã load chưa
node -e "require('dotenv').config(); console.log(process.env.MONGODB_URI)"

# 3. Kiểm tra xem file có đúng tên không
# Linux/Mac: case-sensitive → .Env ≠ .env
```

### Lỗi 2: Secret bị commit vào git

**Ngay lập tức:**

```bash
# 1. Xóa file khỏi tracking (nhưng giữ file local)
git rm --cached .env.local
git rm --cached .env.production

# 2. Add vào .gitignore
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore

# 3. Commit
git add .gitignore
git commit -m "remove secrets from tracking"

# 4. QUAN TRỌNG: Rotate tất cả secrets đã bị expose!
# Coi như bị hack — đổi password, regenerate API keys
```

**Phòng ngừa với pre-commit hook:**

```bash
# .git/hooks/pre-commit
#!/bin/sh
if git diff --cached --name-only | grep -qE '\.env\.(local|production|staging)$'; then
  echo "❌ Không được commit file .env.local/.env.production!"
  exit 1
fi
```

### Lỗi 3: "JWT_SECRET too short"

```
Error: jwt.secret (min 32 chars for HMAC-SHA256) length must be at least 32 characters long
```

**Tại sao 32 chars?** HMAC-SHA256 cần key ≥ 256 bits = 32 bytes.

```bash
# Generate secret đủ dài:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Output: 128 char hex string — đủ dài cho production
```

### Lỗi 4: Config không load đúng môi trường

```typescript
// ❌ Sai — đọc trực tiếp trước khi dotenv load
const port = process.env.PORT || 3000;

// ✅ Đúng — đảm bảo dotenv load trước
// Trong main.ts: config() phải gọi TRƯỚC NestFactory.create()
config({ path: '.env.development' });
const app = await NestFactory.create(AppModule); // Lúc này env đã load
```

### Lỗi 5: Hardcode trong production build

```typescript
// ❌ Sai — URL hardcode sẽ fail khi deploy
const apiUrl = 'http://localhost:3000'; // localhost không có nghĩa trên server

// ✅ Đúng
const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000';
```

---

## Milestone 1: Student Management API

### Yêu cầu dự án

Xây dựng một **Student Management REST API** hoàn chỉnh với:

**Entities cần implement:**

1. **Student** (sinh viên)
   - hoTen, namSinh, email (unique), gpa, trangThai, isActive
   - CRUD đầy đủ + soft delete

2. **Course** (môn học)
   - maMon (unique), tenMon, soTinChi (1-5), giangVien, isActive
   - CRUD đầy đủ

3. **Enrollment** (đăng ký môn)
   - studentId, courseId, enrolledAt, grade (0-10, optional)
   - Không được đăng ký trùng
   - Không được đăng ký môn đã kết thúc

**Endpoints bắt buộc:**

```
GET    /students                     Danh sách, pagination, filter, search
POST   /students                     Tạo mới
GET    /students/:id                 Chi tiết 1 sinh viên
PATCH  /students/:id                 Cập nhật
DELETE /students/:id                 Soft delete

GET    /courses                      Danh sách môn
POST   /courses                      Tạo mới
GET    /courses/:id                  Chi tiết môn
PATCH  /courses/:id                  Cập nhật
DELETE /courses/:id                  Soft delete

POST   /students/:id/enroll          Đăng ký môn học (body: { courseId })
DELETE /students/:id/enroll/:courseId  Hủy đăng ký
GET    /students/:id/courses         Danh sách môn đã đăng ký của sv
GET    /courses/:id/students         Danh sách sv đã đăng ký môn này

GET    /stats                        Tổng quan: số sv, môn, đăng ký, avg GPA
```

**Yêu cầu kỹ thuật:**

- TypeScript strict — không có `any` trong service/controller
- MongoDB với Mongoose schemas
- Repository Pattern (extend BaseRepository hoặc implement tương đương)
- DTOs với class-validator + class-transformer
- Response DTO — không expose `_id` trực tiếp, dùng `id`
- `AllExceptionsFilter` global
- `BootException` với error codes cho mọi business error
- `.env` với Joi validation — app không start nếu thiếu config
- Swagger docs đầy đủ
- `.gitignore` có `.env.local` và `.env.production`

**Yêu cầu nâng cao (bonus):**

- `GET /students?sort=gpa:desc,hoTen:asc` — sorting linh động
- `GET /students?fields=id,hoTen,email` — field selection
- `GET /courses/:id/stats` — thống kê điểm môn học (avg, min, max, pass rate)
- `GET /health` — health check endpoint

### Rubric chấm điểm

| Tiêu chí | Điểm |
|---------|------|
| API chạy được, không crash | 20 |
| CRUD đúng HTTP methods + status codes | 15 |
| Validation hoạt động đúng | 15 |
| Repository Pattern tách biệt rõ | 10 |
| Error handling với error codes | 10 |
| Config từ .env, có Joi validation | 10 |
| Swagger docs đầy đủ và chính xác | 10 |
| Code sạch, TypeScript strict | 10 |
| **Tổng** | **100** |
| Bonus features | +10 |

### Cấu trúc project đề xuất

```
src/
  config/
    app-config.interface.ts
    config.validation.ts
    configuration.ts
    app-config.module.ts

  students/
    dto/
      create-student.dto.ts
      update-student.dto.ts
      student-response.dto.ts
      query-student.dto.ts
    student.schema.ts
    student-errors.ts
    students.repository.ts
    students.service.ts
    students.controller.ts
    students.module.ts

  courses/
    dto/ ...
    course.schema.ts
    course-errors.ts
    courses.repository.ts
    courses.service.ts
    courses.controller.ts
    courses.module.ts

  enrollments/
    dto/ ...
    enrollment.schema.ts
    enrollment-errors.ts
    enrollments.repository.ts
    enrollments.service.ts
    enrollments.module.ts

  stats/
    stats.service.ts
    stats.controller.ts
    stats.module.ts

  app.module.ts
  main.ts

.env.development      ← commit (không có secrets thật)
.env.local            ← KHÔNG commit
.env.example          ← commit (template, tất cả values là placeholder)
.gitignore
```

### Submission

- GitHub repository (public hoặc add giảng viên vào)
- README.md với hướng dẫn chạy project
- Postman collection hoặc Swagger URL
- Deadline: **trước buổi học Tuần 5**

---

## Câu hỏi tự kiểm tra

1. Tại sao KHÔNG bao giờ commit `.env.production` vào git?
2. `Joi.string().min(32)` trong validation JWT secret có ý nghĩa gì?
3. `abortEarly: false` trong Joi validation có tác dụng gì?
4. Giải thích tại sao "fail fast at startup" tốt hơn "fail at runtime"
5. `process.env.JWT_SECRET!` (dấu `!`) nghĩa là gì? Khi nào dùng?
6. Tại sao dev environment nên có `JWT_EXPIRES_IN=30d` nhưng production là `7d`?
7. Khi secret bị commit vào git, tại sao xóa commit thôi là chưa đủ?
8. `expandVariables: true` trong ConfigModule cho phép gì?

---

## Đọc thêm

- [The Twelve-Factor App](https://12factor.net/) — đọc full 12 factors
- [Joi documentation](https://joi.dev/api/) — API reference đầy đủ
- [NestJS Configuration](https://docs.nestjs.com/techniques/configuration) — official docs
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) — security best practices
- [dotenv documentation](https://github.com/motdotla/dotenv) — file format, options
- nestjs-boot source: `src/config/validators.ts` — xem Joi schema thực tế
- nestjs-boot source: `src/config/config.service.ts` — typed dot-notation access
- nestjs-boot source: `src/config/config.module.ts` — sync + async registration

---

*Giai đoạn 1 hoàn thành. Giai đoạn 2 tiếp theo: Authentication (JWT), Caching (Redis), Testing (Vitest + Supertest), và Error Handling nâng cao.*
