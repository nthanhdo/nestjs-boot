# Tuần 3: API Design & Validation

> **Giai đoạn:** Stage 1 — Nền tảng | **Tuần:** 3/4
> **Thời lượng:** 3 giờ (1 giờ lý thuyết + 2 giờ thực hành)
> **Yêu cầu đầu vào:** Tuần 1 + 2 — có API kết nối MongoDB

---

## Mục tiêu học tập

Sau buổi này, sinh viên sẽ có thể:

1. Giải thích REST conventions và áp dụng đúng HTTP methods, status codes
2. Mô tả NestJS request lifecycle theo thứ tự chính xác
3. Thiết kế DTOs với class-validator và class-transformer
4. Implement error handling chuẩn với `AllExceptionsFilter`
5. Setup Swagger để auto-generate API documentation
6. Hiểu và dùng `BootException` với error codes

---

## Phần 1: API là gì và REST conventions (25 phút)

### 1.1 API — Contract giữa client và server

**Analogy:** API giống như menu của nhà hàng.
- Menu (API docs) cho khách biết có thể gọi món gì
- Khách không cần vào bếp — chỉ cần biết tên món, cách gọi
- Bếp không cần biết khách là ai — chỉ nhận order, trả món

```
Client (browser, mobile app, another service)
    ↕ HTTP Request/Response
Server (NestJS API)
    ↕ Function calls
Database (MongoDB)
```

### 1.2 HTTP Protocol cơ bản

Mỗi HTTP request gồm:

```
POST /students HTTP/1.1          ← Method + Path + Protocol
Host: api.school.edu              ← Header
Content-Type: application/json    ← Header
Authorization: Bearer eyJhbG...  ← Header
                                  ← Blank line
{"hoTen": "An", "email": "..."}  ← Body (chỉ có với POST/PUT/PATCH)
```

Mỗi HTTP response gồm:

```
HTTP/1.1 201 Created             ← Protocol + Status Code
Content-Type: application/json   ← Header
                                  ← Blank line
{"id": "abc123", "hoTen": "An"}  ← Body
```

### 1.3 REST — Quy ước thiết kế URL + Methods

REST không phải standard cứng — là một set conventions. Mục tiêu: URL đọc là hiểu ngay.

**Nguyên tắc:** URL = danh từ (resource), HTTP Method = động từ (action)

```
Collection: /students          (số nhiều)
Item:        /students/:id     (với identifier)

GET    /students          → Lấy danh sách sinh viên
POST   /students          → Tạo sinh viên mới
GET    /students/:id      → Lấy 1 sinh viên
PUT    /students/:id      → Update toàn bộ sinh viên (replace)
PATCH  /students/:id      → Update 1 phần sinh viên (partial)
DELETE /students/:id      → Xóa sinh viên

Nested resource (quan hệ):
GET    /students/:id/courses   → Môn học của sinh viên
POST   /students/:id/courses   → Đăng ký thêm môn
DELETE /students/:id/courses/:courseId → Hủy đăng ký
```

**URL KHÔNG nên có động từ:**

```
❌ /getStudents
❌ /createStudent
❌ /deleteStudent/123
❌ /students/getById/123

✅ GET /students
✅ POST /students
✅ DELETE /students/123
✅ GET /students/123
```

### 1.4 HTTP Status Codes — Nói chuyện với client

Status codes là cách server nói với client "điều gì đã xảy ra":

| Code | Tên | Dùng khi |
|------|-----|---------|
| 200 | OK | Request thành công, có trả data |
| 201 | Created | Tạo resource mới thành công |
| 204 | No Content | Thành công, không có body (DELETE) |
| 400 | Bad Request | Input sai format, thiếu field bắt buộc |
| 401 | Unauthorized | Chưa đăng nhập / token hết hạn |
| 403 | Forbidden | Đã đăng nhập nhưng không có quyền |
| 404 | Not Found | Resource không tồn tại |
| 409 | Conflict | Duplicate — email đã tồn tại, etc. |
| 422 | Unprocessable Entity | Input đúng format nhưng logic sai |
| 429 | Too Many Requests | Rate limit |
| 500 | Internal Server Error | Lỗi server — bug trong code |
| 503 | Service Unavailable | Server quá tải hoặc maintenance |

**Sai lầm phổ biến:**

```javascript
// ❌ Sai — dùng 200 cho mọi response kể cả lỗi
{ status: 200, error: "User not found" }

// ✅ Đúng — dùng status code đúng ngữ nghĩa
HTTP 404
{ message: "User not found" }
```

---

## Phần 2: NestJS Request Lifecycle (20 phút)

### 2.1 Thứ tự xử lý request

Khi 1 request đến NestJS, nó đi qua các tầng theo thứ tự:

```
Request
   ↓
[1] Middleware          — Express/Fastify middleware, chạy trước mọi thứ
   ↓
[2] Guard              — Kiểm tra authorization (có quyền không?)
   ↓
[3] Interceptor (pre)  — Transform request, logging, timing
   ↓
[4] Pipe               — Validate + transform input
   ↓
[5] Handler (Controller method) — Xử lý request
   ↓
[6] Interceptor (post) — Transform response
   ↓
[7] Exception Filter   — Bắt và xử lý errors

Response
```

**Analogy:** Giống như kiểm tra tại sân bay:
1. Middleware = cửa vào sân bay (kiểm tra vé)
2. Guard = cảnh sát cửa khẩu (kiểm tra hộ chiếu + quyền hạn)
3. Interceptor = máy soi hành lý (check trước và sau)
4. Pipe = cân hành lý (validate kích thước, trọng lượng)
5. Handler = lên máy bay (xử lý thực tế)

### 2.2 ResponseInterceptor trong nestjs-boot

File `src/common/interceptors/response.interceptor.ts` wrap toàn bộ response vào envelope thống nhất:

```typescript
// Không có ResponseInterceptor:
GET /students/123 → { _id: "...", hoTen: "An", email: "..." }

// Có ResponseInterceptor:
GET /students/123 →
{
  "statusCode": 200,
  "message": "Success",
  "data": { "_id": "...", "hoTen": "An", "email": "..." }
}

// Paginated response:
GET /students →
{
  "statusCode": 200,
  "message": "Success",
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

**Lợi ích:** Client luôn biết cấu trúc response — không phải xử lý nhiều dạng khác nhau.

### 2.3 AllExceptionsFilter trong nestjs-boot

File `src/common/filters/all-exceptions.filter.ts` catch **tất cả** exceptions và trả về response thống nhất:

```typescript
// Nếu không có filter, NestJS default trả về:
// HTML error page (Express) hoặc format khác nhau tùy exception

// Với AllExceptionsFilter, luôn nhận được:
{
  "statusCode": 404,
  "message": "Sinh viên với ID '123' không tồn tại",
  "error": "NotFoundException",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/students/123"
}

// Nếu có stable error code (dùng BootException):
{
  "statusCode": 404,
  "message": "Sinh viên không tồn tại",
  "error": "NotFoundException",
  "code": "STUDENT_NOT_FOUND",  ← client switch on this, not message
  "timestamp": "...",
  "path": "..."
}
```

---

## Phần 3: DTOs và Validation (25 phút)

### 3.1 Tại sao cần DTO? Không dùng Entity trực tiếp?

**Vấn đề khi dùng entity trực tiếp:**

```typescript
// Student entity từ database
class Student {
  _id: string;
  hoTen: string;
  email: string;
  passwordHash: string;  // ← KHÔNG BAO GIỜ trả về cho client!
  isActive: boolean;
  createdAt: Date;
  __v: number;           // Mongoose version key — client không cần
}

// Nếu dùng entity làm request body, client gửi lên:
{
  "_id": "fake_id",        // Client không được phép set ID
  "passwordHash": "...",   // Client không được phép set password hash
  "__v": 999,              // ???
}
```

**DTO giải quyết bằng cách tách biệt:**

```
CreateStudentDto    — định nghĩa INPUT khi tạo
UpdateStudentDto    — định nghĩa INPUT khi update (thường partial)
StudentResponseDto  — định nghĩa OUTPUT trả về cho client
```

### 3.2 class-validator — Validation decorators

```typescript
import {
  IsString, IsEmail, IsInt, IsNumber, IsOptional,
  IsEnum, Min, Max, MinLength, MaxLength, Matches,
  ValidateNested, IsArray, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TrangThaiSV {
  DANG_HOC = 'DANG_HOC',
  BAO_LUU = 'BAO_LUU',
  TOT_NGHIEP = 'TOT_NGHIEP',
}

export class CreateStudentDto {
  @IsString({ message: 'Họ tên phải là chuỗi' })
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  hoTen: string;

  @IsInt({ message: 'Năm sinh phải là số nguyên' })
  @Min(1990, { message: 'Năm sinh phải từ 1990 trở đi' })
  @Max(new Date().getFullYear() - 17, { message: 'Phải đủ 17 tuổi' })
  namSinh: number;

  @IsEmail({}, { message: 'Email không đúng format' })
  email: string;

  @IsNumber({}, { message: 'GPA phải là số' })
  @Min(0, { message: 'GPA không thể âm' })
  @Max(10, { message: 'GPA tối đa 10' })
  @IsOptional()
  gpa?: number;

  @IsEnum(TrangThaiSV, { message: 'Trạng thái không hợp lệ' })
  @IsOptional()
  trangThai?: TrangThaiSV;

  // Validate nested object
  @ValidateNested()
  @Type(() => DiaChi)
  @IsOptional()
  diaChi?: DiaChi;
}

export class DiaChi {
  @IsString()
  tinh: string;

  @IsString()
  @IsOptional()
  quan?: string;
}
```

**Validation response khi gửi sai:**

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    "Email không đúng format",
    "Năm sinh phải là số nguyên",
    "Họ tên phải có ít nhất 2 ký tự"
  ]
}
```

### 3.3 class-transformer — Control dữ liệu vào/ra

```typescript
import { Exclude, Expose, Transform, Type } from 'class-transformer';

// Response DTO — kiểm soát những gì client thấy
export class StudentResponseDto {
  @Expose()
  id: string; // Expose _id thành "id" (friendly hơn)

  @Expose()
  hoTen: string;

  @Expose()
  email: string;

  @Expose()
  gpa?: number;

  @Expose()
  @Transform(({ value }) => value?.toISOString()) // Date → ISO string
  createdAt: Date;

  @Exclude() // KHÔNG bao giờ expose
  passwordHash: string;

  @Exclude()
  __v: number;

  @Expose()
  @Transform(({ value }) => value === true) // Ensure boolean
  isActive: boolean;
}
```

```typescript
// Trong service, convert entity → DTO trước khi trả về
import { plainToInstance } from 'class-transformer';

async findById(id: string): Promise<StudentResponseDto> {
  const student = await this.studentsRepository.findById(id);
  if (!student) throw new NotFoundException('...');

  // Chỉ expose những field có @Expose()
  return plainToInstance(StudentResponseDto, student.toObject(), {
    excludeExtraneousValues: true, // Ẩn field không có @Expose
  });
}
```

### 3.4 BootException — Error codes chuẩn

nestjs-boot cung cấp `BootException` thêm `code` field ổn định vào mọi error. Xem `src/common/boot-exception.ts`:

```typescript
// Thay vì:
throw new NotFoundException('Sinh viên không tồn tại');
// → Client chỉ có message để switch on — message có thể thay đổi!

// Dùng BootException:
throw new BootException('Sinh viên không tồn tại', {
  code: 'STUDENT_NOT_FOUND',  // Code KHÔNG thay đổi — client switch on này
  status: 404,
});

// Response:
{
  "statusCode": 404,
  "message": "Sinh viên không tồn tại",
  "code": "STUDENT_NOT_FOUND",  ← stable, không đổi dù message thay đổi
  "error": "BootException"
}
```

**Pattern tốt — tập trung error codes:**

```typescript
// src/students/student-errors.ts
export const StudentErrors = {
  NOT_FOUND: { code: 'STUDENT_NOT_FOUND', status: 404 },
  EMAIL_CONFLICT: { code: 'STUDENT_EMAIL_CONFLICT', status: 409 },
  INVALID_GPA: { code: 'STUDENT_INVALID_GPA', status: 422 },
  ALREADY_GRADUATED: { code: 'STUDENT_ALREADY_GRADUATED', status: 409 },
} as const;

// Trong service:
throw new BootException('Sinh viên không tồn tại', StudentErrors.NOT_FOUND);
```

### 3.5 Problem Details RFC 7807

nestjs-boot hỗ trợ [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) Problem Details format. Xem `src/common/problem-details.ts`:

```json
// Standard Problem Details response:
{
  "type": "about:blank#STUDENT_NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "Sinh viên với ID '123' không tồn tại",
  "instance": "/api/students/123"
}
```

Format này được nhiều API framework và client tự động xử lý — đặc biệt hữu ích cho microservices.

---

## Phần 4: Swagger — Auto-generate API docs (15 phút)

### 4.1 Tại sao cần API documentation?

- Frontend dev cần biết API endpoint nào, gửi gì, nhận gì
- Không có docs → hỏi backend dev từng field → mất thời gian
- Swagger tự generate từ code → docs luôn đồng bộ với code thật

### 4.2 Setup Swagger trong NestJS

```bash
npm install @nestjs/swagger
```

```typescript
// src/main.ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Student API')
    .setDescription('API quản lý sinh viên - khóa học Backend Engineering')
    .setVersion('1.0')
    .addBearerAuth() // Nếu có auth
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  // Mở browser: http://localhost:3000/api/docs

  await app.listen(3000);
}
```

### 4.3 Annotate DTO với Swagger decorators

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty({
    description: 'Họ và tên đầy đủ của sinh viên',
    example: 'Nguyễn Văn An',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  hoTen: string;

  @ApiProperty({
    description: 'Năm sinh',
    example: 2002,
    minimum: 1990,
  })
  @IsInt()
  @Min(1990)
  namSinh: number;

  @ApiProperty({
    description: 'Email (unique)',
    example: 'an.nguyen@school.edu.vn',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'GPA trên thang 10',
    example: 8.5,
    minimum: 0,
    maximum: 10,
  })
  @IsNumber()
  @Min(0)
  @Max(10)
  @IsOptional()
  gpa?: number;
}
```

```typescript
// Annotate controller methods
import { ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';

@Controller('students')
@ApiTags('Students') // Nhóm endpoints trong Swagger UI
export class StudentsController {

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách sinh viên với pagination và filter' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, description: 'Tìm theo tên' })
  @ApiQuery({ name: 'minGpa', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Danh sách sinh viên kèm metadata phân trang' })
  findAll(/* ... */) { /* ... */ }

  @Post()
  @ApiOperation({ summary: 'Tạo sinh viên mới' })
  @ApiResponse({ status: 201, description: 'Sinh viên được tạo thành công', type: StudentResponseDto })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Email đã tồn tại' })
  create(@Body() dto: CreateStudentDto) { /* ... */ }
}
```

---

## Phần 5: Hands-on — Full CRUD với chuẩn xây dựng (60 phút)

### Bước 1: Restructure project

```
src/students/
  dto/
    create-student.dto.ts     ← Input validation
    update-student.dto.ts     ← Partial of create
    student-response.dto.ts   ← Output shape
    query-student.dto.ts      ← Query params validation
  student.schema.ts
  student-errors.ts           ← Error codes
  students.repository.ts
  students.service.ts
  students.controller.ts
  students.module.ts
```

### Bước 2: Query DTO với class-validator

```typescript
// src/students/dto/query-student.dto.ts
import { IsOptional, IsInt, Min, Max, IsString, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class QueryStudentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  minGpa?: number;

  @IsOptional()
  @Type(() => Number)
  maxGpa?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
```

### Bước 3: UpdateStudentDto — Partial tự động

```typescript
// src/students/dto/update-student.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateStudentDto } from './create-student.dto';

// PartialType làm tất cả field trở thành optional
// Giữ nguyên tất cả validation decorators
export class UpdateStudentDto extends PartialType(CreateStudentDto) {}
```

### Bước 4: Error codes

```typescript
// src/students/student-errors.ts
import { BootException } from 'nestjs-boot'; // hoặc từ common

export const StudentErrors = {
  NOT_FOUND: (id: string) => new BootException(
    `Sinh viên với ID "${id}" không tồn tại`,
    { code: 'STUDENT_NOT_FOUND', status: 404 },
  ),
  EMAIL_CONFLICT: (email: string) => new BootException(
    `Email "${email}" đã được đăng ký`,
    { code: 'STUDENT_EMAIL_CONFLICT', status: 409 },
  ),
  INVALID_ID: (id: string) => new BootException(
    `ID "${id}" không đúng định dạng MongoDB ObjectId`,
    { code: 'STUDENT_INVALID_ID', status: 400 },
  ),
};
```

### Bước 5: Service hoàn chỉnh

```typescript
// src/students/students.service.ts
import { Injectable } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { StudentsRepository } from './students.repository';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { StudentResponseDto } from './dto/student-response.dto';
import { StudentErrors } from './student-errors';

@Injectable()
export class StudentsService {
  constructor(private readonly repo: StudentsRepository) {}

  async findAll(query: QueryStudentDto) {
    const result = await this.repo.findWithFilter(
      {
        search: query.search,
        minGpa: query.minGpa,
        maxGpa: query.maxGpa,
        isActive: query.isActive,
      },
      query.page,
      query.limit,
    );

    // Transform tất cả items trong data array
    return {
      ...result,
      data: result.data.map(s =>
        plainToInstance(StudentResponseDto, s.toObject(), {
          excludeExtraneousValues: true,
        }),
      ),
    };
  }

  async findById(id: string): Promise<StudentResponseDto> {
    if (!isValidObjectId(id)) throw StudentErrors.INVALID_ID(id);

    const student = await this.repo.findById(id);
    if (!student) throw StudentErrors.NOT_FOUND(id);

    return plainToInstance(StudentResponseDto, student.toObject(), {
      excludeExtraneousValues: true,
    });
  }

  async create(dto: CreateStudentDto): Promise<StudentResponseDto> {
    const exists = await this.repo.findByEmail(dto.email);
    if (exists) throw StudentErrors.EMAIL_CONFLICT(dto.email);

    const student = await this.repo.create(dto as any);
    return plainToInstance(StudentResponseDto, student.toObject(), {
      excludeExtraneousValues: true,
    });
  }

  async update(id: string, dto: UpdateStudentDto): Promise<StudentResponseDto> {
    if (!isValidObjectId(id)) throw StudentErrors.INVALID_ID(id);

    const existing = await this.repo.findById(id);
    if (!existing) throw StudentErrors.NOT_FOUND(id);

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.repo.findByEmail(dto.email);
      if (emailTaken) throw StudentErrors.EMAIL_CONFLICT(dto.email);
    }

    const updated = await this.repo.update(id, dto as any);
    return plainToInstance(StudentResponseDto, updated!.toObject(), {
      excludeExtraneousValues: true,
    });
  }

  async remove(id: string): Promise<void> {
    if (!isValidObjectId(id)) throw StudentErrors.INVALID_ID(id);
    const student = await this.repo.findById(id);
    if (!student) throw StudentErrors.NOT_FOUND(id);
    await this.repo.softDelete(id);
  }
}
```

### Bước 6: Controller với ValidationPipe trên Query

```typescript
// src/students/students.controller.ts
import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, HttpCode, HttpStatus,
  ValidationPipe, UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';

@ApiTags('Students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách sinh viên' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  findAll(@Query() query: QueryStudentDto) {
    return this.studentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin 1 sinh viên' })
  findOne(@Param('id') id: string) {
    return this.studentsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo sinh viên mới' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email đã tồn tại' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Patch(':id') // PATCH cho partial update
  @ApiOperation({ summary: 'Cập nhật thông tin sinh viên' })
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa sinh viên (soft delete)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.studentsService.remove(id);
  }
}
```

### Bước 7: Enable Global Filter

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from 'nestjs-boot'; // hoặc import từ common/filters
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Global validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // 2. Global exception filter — bắt tất cả errors
  app.useGlobalFilters(new AllExceptionsFilter());

  // 3. Swagger
  const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
  const config = new DocumentBuilder()
    .setTitle('Student API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(3000);
  console.log(`Server: http://localhost:3000`);
  console.log(`Swagger: http://localhost:3000/api/docs`);
}
bootstrap();
```

### Bước 8: Test đầy đủ

```bash
# Khởi động
npm run start:dev

# Test tạo mới — hợp lệ
curl -X POST http://localhost:3000/students \
  -H "Content-Type: application/json" \
  -d '{"hoTen":"Nguyễn Văn An","namSinh":2002,"email":"an@school.edu.vn","gpa":8.5}'

# Test validation — email sai format
curl -X POST http://localhost:3000/students \
  -H "Content-Type: application/json" \
  -d '{"hoTen":"An","namSinh":2002,"email":"not-email"}'
# Expected: 400 Bad Request với details

# Test conflict — email đã có
curl -X POST http://localhost:3000/students \
  -H "Content-Type: application/json" \
  -d '{"hoTen":"Bình","namSinh":2001,"email":"an@school.edu.vn"}'
# Expected: 409 Conflict với code: STUDENT_EMAIL_CONFLICT

# Test not found
curl http://localhost:3000/students/000000000000000000000000
# Expected: 404 với code: STUDENT_NOT_FOUND

# Test invalid ID
curl http://localhost:3000/students/not-an-id
# Expected: 400 với code: STUDENT_INVALID_ID

# Test pagination + filter
curl "http://localhost:3000/students?page=1&limit=5&minGpa=8.0&isActive=true"

# Mở Swagger UI
open http://localhost:3000/api/docs
```

---

## Phần 6: Lỗi thường gặp

### Lỗi 1: Validation không chạy với Query params

```
GET /students?page=abc → không báo lỗi???
```

**Nguyên nhân:** Query params đến dưới dạng string. Cần `transform: true` và `@Type(() => Number)` trong DTO.

```typescript
// Sai — không convert type
@IsInt()
page?: number;

// Đúng
@Type(() => Number)  // Convert string "1" → number 1 TRƯỚC khi validate
@IsInt()
page?: number;
```

### Lỗi 2: @Exclude() không hoạt động

```typescript
// Trong response vẫn thấy passwordHash???
```

**Nguyên nhân:** Chưa dùng `plainToInstance` với `excludeExtraneousValues: true`.

```typescript
// Sai — return entity trực tiếp
return student; // @Exclude() không có tác dụng!

// Đúng — transform qua DTO trước
return plainToInstance(StudentResponseDto, student.toObject(), {
  excludeExtraneousValues: true,
});
```

### Lỗi 3: Swagger không hiển thị đúng types

```
Parameter "page" hiển thị là "string" trong Swagger???
```

**Nguyên nhân:** Chưa thêm `@ApiProperty` hoặc không có `@Type()`.

```typescript
@ApiProperty({ type: Number, example: 1 })
@Type(() => Number)
@IsInt()
page?: number;
```

### Lỗi 4: `whitelist: true` lọc mất data

```
Gửi: { "hoTen": "An", "hackField": "danger" }
Service nhận: { "hoTen": "An" } — hackField bị xóa
```

**Đây là behavior đúng!** `whitelist: true` tự xóa các field không có trong DTO.

**Khi muốn báo lỗi thay vì xóa:**

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true, // ← báo 400 nếu có field lạ
}));
```

---

## Bài tập thực hành

### Bài tập 1 (Trong lớp — 30 phút)

Thêm endpoint bulk operations:

```
POST /students/bulk — tạo nhiều sinh viên cùng lúc (max 100)
Body: { students: CreateStudentDto[] }
Response: { created: number, failed: number, errors: string[] }
```

### Bài tập 2 (Về nhà — deadline tuần sau)

Implement `CoursesController` hoàn chỉnh với:
1. CRUD đầy đủ với proper status codes
2. DTO với validation (`soTinChi` từ 1-5, `maMon` format uppercase alphanumeric)
3. Response DTO (exclude mongoose internals)
4. Endpoint `GET /courses/stats` — tổng số môn, tổng tín chỉ, trung bình tín chỉ
5. Endpoint `GET /students/:id/courses` — lấy danh sách môn của sinh viên (dùng Enrollment từ tuần trước)
6. Swagger docs đầy đủ cho tất cả endpoints

---

## Câu hỏi tự kiểm tra

1. `PUT` và `PATCH` khác nhau thế nào? Khi nào dùng cái nào?
2. Status code 401 và 403 khác nhau thế nào?
3. Tại sao không nên return Entity trực tiếp từ controller?
4. `class-validator` validate ở tầng nào trong request lifecycle?
5. `@Exclude()` trong `class-transformer` hoạt động khi nào? Điều kiện cần là gì?
6. `BootException` thêm gì so với `HttpException` thông thường?
7. Tại sao `whitelist: true` trong ValidationPipe lại quan trọng về security?
8. Swagger `@ApiProperty` và `class-validator` decorators có độc lập với nhau không? Tại sao?

---

## Đọc thêm

- [REST API Design Best Practices](https://restfulapi.net/) — conventions đầy đủ
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) — MDN reference
- [class-validator docs](https://github.com/typestack/class-validator) — tất cả decorators
- [class-transformer docs](https://github.com/typestack/class-transformer) — @Expose, @Exclude, @Transform
- [RFC 7807 Problem Details](https://www.rfc-editor.org/rfc/rfc7807) — standard error format
- nestjs-boot source: `src/common/filters/all-exceptions.filter.ts`
- nestjs-boot source: `src/common/interceptors/response.interceptor.ts`
- nestjs-boot source: `src/common/boot-exception.ts`
- nestjs-boot source: `src/common/problem-details.ts`

---

*Tuần tiếp theo: Config & Environment Management — 12-Factor App, typed config validation, secrets management, và milestone project.*
