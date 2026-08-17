# Tuần 1: TypeScript & NestJS Core

> **Giai đoạn:** Stage 1 — Nền tảng | **Tuần:** 1/4
> **Thời lượng:** 3 giờ (1 giờ lý thuyết + 2 giờ thực hành)
> **Yêu cầu đầu vào:** Biết lập trình cơ bản (bất kỳ ngôn ngữ), biết dùng terminal

---

## Mục tiêu học tập

Sau buổi này, sinh viên sẽ có thể:

1. Giải thích tại sao TypeScript được ưa dùng hơn JavaScript trong dự án lớn
2. Viết và đọc hiểu TypeScript cơ bản: types, interfaces, generics, decorators
3. Mô tả kiến trúc Module / Controller / Service / Provider của NestJS
4. Giải thích Dependency Injection bằng ngôn từ của mình
5. Tạo một NestJS module mới từ đầu và kết nối với module khác

---

## Phần 1: Tại sao TypeScript? (30 phút)

### 1.1 Vấn đề với JavaScript thuần

Hãy tưởng tượng bạn đang viết hàm tính tổng điểm của sinh viên:

```javascript
// JavaScript — KHÔNG có type
function tinhTongDiem(danhSachDiem) {
  return danhSachDiem.reduce((tong, diem) => tong + diem, 0);
}

// Gọi đúng:
tinhTongDiem([8, 9, 7]); // 24 ✅

// Gọi sai — JavaScript KHÔNG báo lỗi cho đến runtime:
tinhTongDiem("8,9,7");  // "08,9,7" — cộng string! 😱
tinhTongDiem(null);     // TypeError: Cannot read properties of null 💥
tinhTongDiem([8, "A", 7]); // "8A7" — NaN? String? 🤷
```

Lỗi này sẽ chỉ xuất hiện **khi chương trình đang chạy** — có thể là lúc 2 giờ sáng production crash.

### 1.2 TypeScript phòng ngừa lỗi tại compile time

```typescript
// TypeScript — CÓ type
function tinhTongDiem(danhSachDiem: number[]): number {
  return danhSachDiem.reduce((tong, diem) => tong + diem, 0);
}

// TypeScript báo lỗi NGAY KHI BẠN GÕ, trước khi chạy:
tinhTongDiem("8,9,7");   // ❌ Error: Argument of type 'string' is not assignable to parameter of type 'number[]'
tinhTongDiem(null);      // ❌ Error: Argument of type 'null' is not assignable...
tinhTongDiem([8, "A"]); // ❌ Error: Type 'string' is not assignable to type 'number'

// Chỉ cho phép cách đúng:
tinhTongDiem([8, 9, 7]); // ✅ 24
```

**Kết luận:** TypeScript = JavaScript + kiểm tra kiểu dữ liệu tại compile time. Nó giúp bạn tìm lỗi trước khi user gặp lỗi.

### 1.3 Lợi ích thực tế trong team

| Tình huống | JavaScript | TypeScript |
|-----------|-----------|-----------|
| Gọi hàm của teammate | Phải đọc code hoặc hỏi | IDE tự hiện gợi ý + tài liệu |
| Đổi tên field trong object | Tìm bằng tay, dễ sót | Compiler báo ngay mọi chỗ dùng |
| Refactor code | Rủi ro cao | An toàn — type system bắt lỗi |
| Code review | Khó verify logic | Contract rõ ràng qua interface |

---

## Phần 2: TypeScript Cơ Bản (45 phút)

### 2.1 Basic Types

```typescript
// Primitive types
const tenSinhVien: string = "Nguyễn Văn An";
const diemTrungBinh: number = 8.5;
const daTotnghiep: boolean = false;

// Array
const danhSachDiem: number[] = [8, 9, 7, 10];
const danhSachTen: string[] = ["An", "Bình", "Chi"];

// Union type — có thể là 1 trong nhiều kiểu
let ketQua: string | number;
ketQua = "Pass";  // ✅
ketQua = 8.5;     // ✅
ketQua = true;    // ❌ Error

// Optional — có thể không có giá trị
function chao(ten: string, chucDanh?: string): string {
  if (chucDanh) {
    return `Xin chào ${chucDanh} ${ten}`;
  }
  return `Xin chào ${ten}`;
}

chao("An");           // "Xin chào An"
chao("An", "Thầy");   // "Xin chào Thầy An"
```

### 2.2 Interface — Định nghĩa "hình dạng" của object

Interface giống như một **bản thiết kế** — nó nói object phải có những field nào với kiểu gì.

```typescript
// Định nghĩa blueprint cho SinhVien
interface SinhVien {
  maSV: string;
  hoTen: string;
  namSinh: number;
  email: string;
  gpa?: number; // optional — không bắt buộc
}

// Sử dụng interface
const sv1: SinhVien = {
  maSV: "SV001",
  hoTen: "Nguyễn Văn An",
  namSinh: 2002,
  email: "an@email.com",
};

// ❌ Error: Property 'email' is missing
const sv2: SinhVien = {
  maSV: "SV002",
  hoTen: "Trần Thị Bình",
  namSinh: 2003,
  // email bị quên!
};

// Interface có thể extend interface khác
interface SinhVienDaiHoc extends SinhVien {
  nganh: string;
  lop: string;
  khoaHoc: number; // ví dụ: 2020, 2021, 2022
}
```

### 2.3 Generics — Code tái sử dụng cho nhiều kiểu dữ liệu

**Vấn đề:** Bạn cần hàm lấy phần tử đầu tiên của mảng. Nếu không có generics, bạn phải viết:

```typescript
function layDauTienSo(mang: number[]): number { return mang[0]; }
function layDauTienChuoi(mang: string[]): string { return mang[0]; }
// ... viết lại mãi cho mỗi kiểu
```

**Giải pháp với Generics:**

```typescript
// T là "type parameter" — placeholder cho kiểu thực tế
function layDauTien<T>(mang: T[]): T {
  return mang[0];
}

// TypeScript tự suy ra T từ argument
const so = layDauTien([1, 2, 3]);       // T = number, trả về number
const chuoi = layDauTien(["a", "b"]);   // T = string, trả về string
const sv = layDauTien([sv1, sv2]);      // T = SinhVien, trả về SinhVien
```

**Ứng dụng thực tế — Kết quả phân trang:**

```typescript
// Định nghĩa một lần, dùng cho mọi entity
interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// Sử dụng:
const ketQua: PaginatedResult<SinhVien> = {
  data: [sv1, sv2],
  total: 100,
  page: 1,
  limit: 20,
};
```

> **Lưu ý:** nestjs-boot dùng pattern này trong `src/database/base.repository.ts` (line 6-11):
> ```typescript
> export interface PaginatedResult<T> {
>   data: T[];
>   total: number;
>   page: number;
>   limit: number;
> }
> ```

### 2.4 Enums — Tập hợp hằng số có tên

```typescript
// Thay vì dùng string/number "magic":
// if (trangThai === "ACTIVE") { ... } // dễ typo!

enum TrangThaiSinhVien {
  DANG_HOC = "DANG_HOC",
  BAO_LUU = "BAO_LUU",
  DA_TOT_NGHIEP = "DA_TOT_NGHIEP",
  DUOC_THOI = "DUOC_THOI",
}

interface SinhVienFull extends SinhVien {
  trangThai: TrangThaiSinhVien;
}

// Sử dụng:
const sv: SinhVienFull = {
  // ... các field khác
  trangThai: TrangThaiSinhVien.DANG_HOC,  // ✅ autocomplete + type-safe
};

// ❌ Error — không thể gán string tùy ý
sv.trangThai = "ACTIVE"; // Error: Type '"ACTIVE"' is not assignable
```

### 2.5 Decorators — Metadata và AOP

Decorator là một **hàm đặc biệt** được dùng để "trang trí" (annotate) class, method, hoặc property. Chúng là nền tảng của NestJS.

```typescript
// Decorator đơn giản — log khi method được gọi
function LogMethod(target: any, key: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]) {
    console.log(`Gọi ${key} với args:`, args);
    const result = originalMethod.apply(this, args);
    console.log(`${key} trả về:`, result);
    return result;
  };

  return descriptor;
}

class DiemDanh {
  @LogMethod
  tinhDiem(diem: number[]): number {
    return diem.reduce((a, b) => a + b, 0) / diem.length;
  }
}

const dd = new DiemDanh();
dd.tinhDiem([8, 9, 10]);
// Console: "Gọi tinhDiem với args: [[8,9,10]]"
// Console: "tinhDiem trả về: 9"
```

**Trong NestJS, decorator dùng để:**
- `@Controller('/students')` — đánh dấu class là HTTP controller
- `@Get('/:id')` — đánh dấu method xử lý GET request
- `@Injectable()` — đánh dấu class có thể được inject
- `@Module({})` — khai báo NestJS module

---

## Phần 3: Kiến trúc NestJS (30 phút)

### 3.1 Vấn đề cần giải quyết

Hãy tưởng tượng bạn xây một nhà hàng. Nếu không có phân công rõ ràng:
- Người phục vụ tự chạy vào bếp lấy đồ
- Đầu bếp cũng phải ra bàn ghi order
- Ai cũng làm hết — hỗn loạn, khó mở rộng, khó thay nhân viên

**NestJS giải quyết bằng cách phân tách trách nhiệm rõ ràng:**

| Vai trò nhà hàng | NestJS tương ứng | Trách nhiệm |
|-----------------|-----------------|-------------|
| Người quản lý khu vực | **Module** | Tổ chức các thành phần liên quan lại |
| Người phục vụ | **Controller** | Nhận request từ HTTP, trả response |
| Đầu bếp | **Service** | Xử lý logic nghiệp vụ |
| Kho hàng | **Repository** | Lưu trữ và truy xuất dữ liệu |

### 3.2 Module — Đơn vị tổ chức

```typescript
// students/students.module.ts
import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [],          // Module khác mà module này cần
  controllers: [StudentsController],  // Các controller
  providers: [StudentsService],       // Services, repositories, etc.
  exports: [StudentsService],         // Expose ra ngoài để module khác dùng
})
export class StudentsModule {}
```

Module giống như một **"department"** trong công ty — tự đủ, có thể import/export.

### 3.3 Controller — Xử lý HTTP Request

```typescript
// students/students.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';

@Controller('students') // Base path: /students
export class StudentsController {
  // Dependency Injection — NestJS tự inject StudentsService
  constructor(private readonly studentsService: StudentsService) {}

  @Get()             // GET /students
  findAll() {
    return this.studentsService.findAll();
  }

  @Get(':id')        // GET /students/:id
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Post()            // POST /students
  create(@Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(createStudentDto);
  }

  @Put(':id')        // PUT /students/:id
  update(@Param('id') id: string, @Body() updateDto: Partial<CreateStudentDto>) {
    return this.studentsService.update(id, updateDto);
  }

  @Delete(':id')     // DELETE /students/:id
  remove(@Param('id') id: string) {
    return this.studentsService.remove(id);
  }
}
```

**Controller chỉ làm 2 việc:** nhận request và trả response. Logic nghiệp vụ nằm ở Service.

### 3.4 Service — Logic nghiệp vụ

```typescript
// students/students.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable() // Đánh dấu có thể được inject vào nơi khác
export class StudentsService {
  // Tạm thời dùng in-memory store (tuần 2 sẽ dùng database)
  private students: SinhVien[] = [];
  private nextId = 1;

  findAll(): SinhVien[] {
    return this.students;
  }

  findOne(id: string): SinhVien {
    const student = this.students.find(s => s.maSV === id);
    if (!student) {
      throw new NotFoundException(`Không tìm thấy sinh viên ${id}`);
    }
    return student;
  }

  create(data: CreateStudentDto): SinhVien {
    // Logic nghiệp vụ: generate ID, validate, transform...
    const newStudent: SinhVien = {
      maSV: `SV${String(this.nextId++).padStart(3, '0')}`,
      ...data,
    };
    this.students.push(newStudent);
    return newStudent;
  }

  update(id: string, data: Partial<SinhVien>): SinhVien {
    const student = this.findOne(id); // Reuse findOne — nếu không có sẽ throw
    Object.assign(student, data);
    return student;
  }

  remove(id: string): { message: string } {
    const index = this.students.findIndex(s => s.maSV === id);
    if (index === -1) {
      throw new NotFoundException(`Không tìm thấy sinh viên ${id}`);
    }
    this.students.splice(index, 1);
    return { message: `Đã xóa sinh viên ${id}` };
  }
}
```

### 3.5 Dependency Injection — Tại sao quan trọng?

**Không có DI (cách cũ):**

```typescript
class StudentsController {
  // Controller tự tạo dependency — tightly coupled
  private studentsService = new StudentsService();

  // Vấn đề:
  // 1. Muốn test với mock service? Không được
  // 2. StudentsService cần DatabaseService? Controller phải biết điều đó
  // 3. Muốn swap sang StudentsServiceV2? Phải sửa từng chỗ
}
```

**Với DI (cách NestJS làm):**

```typescript
class StudentsController {
  // Controller khai báo "tôi cần StudentsService"
  // NestJS tự tạo và inject vào — loosely coupled
  constructor(private readonly studentsService: StudentsService) {}

  // Lợi ích:
  // 1. Test: inject MockStudentsService — controller không cần biết
  // 2. Quản lý vòng đời: NestJS biết khi nào tạo, khi nào destroy
  // 3. Singleton pattern: 1 instance dùng cho toàn app (mặc định)
}
```

**Analogy tốt hơn:**
- Không DI = mỗi người tự tự đến siêu thị mua nguyên liệu về nấu
- Có DI = có bếp trưởng (NestJS IoC container) lo toàn bộ việc cung cấp nguyên liệu

---

## Phần 4: Hands-on — Tạo Students Module (60 phút)

### Bước 1: Cài đặt môi trường

```bash
# Kiểm tra Node.js (cần >= 18)
node --version

# Cài NestJS CLI
npm install -g @nestjs/cli

# Tạo project mới
nest new student-api
cd student-api

# Cài thêm packages cần dùng
npm install class-validator class-transformer
```

### Bước 2: Tạo DTO (Data Transfer Object)

DTO định nghĩa "hình dạng" của dữ liệu gửi vào API:

```typescript
// src/students/dto/create-student.dto.ts
import { IsString, IsEmail, IsInt, Min, Max, IsOptional, IsNumber } from 'class-validator';

export class CreateStudentDto {
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  hoTen: string;

  @IsInt({ message: 'Năm sinh phải là số nguyên' })
  @Min(1990)
  @Max(2010)
  namSinh: number;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsNumber()
  @Min(0)
  @Max(10)
  @IsOptional()
  gpa?: number;
}
```

### Bước 3: Tạo module, controller, service

```bash
# NestJS CLI tự generate boilerplate
nest generate module students
nest generate controller students
nest generate service students
```

Hoặc thủ công:

```
src/
  students/
    dto/
      create-student.dto.ts
    students.controller.ts
    students.service.ts
    students.module.ts
```

### Bước 4: Implement service

```typescript
// src/students/students.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';

interface Student {
  id: string;
  maSV: string;
  hoTen: string;
  namSinh: number;
  email: string;
  gpa?: number;
  createdAt: Date;
}

@Injectable()
export class StudentsService {
  private students: Student[] = [];
  private counter = 1;

  findAll(): Student[] {
    return this.students;
  }

  findById(id: string): Student {
    const student = this.students.find(s => s.id === id);
    if (!student) {
      throw new NotFoundException(`Sinh viên với ID "${id}" không tồn tại`);
    }
    return student;
  }

  create(dto: CreateStudentDto): Student {
    // Kiểm tra email đã tồn tại chưa
    const existing = this.students.find(s => s.email === dto.email);
    if (existing) {
      throw new ConflictException(`Email "${dto.email}" đã được đăng ký`);
    }

    const student: Student = {
      id: String(this.counter++),
      maSV: `SV${String(this.counter).padStart(4, '0')}`,
      ...dto,
      createdAt: new Date(),
    };

    this.students.push(student);
    return student;
  }

  update(id: string, dto: Partial<CreateStudentDto>): Student {
    const student = this.findById(id);

    // Nếu đổi email, kiểm tra email mới chưa ai dùng
    if (dto.email && dto.email !== student.email) {
      const emailExists = this.students.find(s => s.email === dto.email);
      if (emailExists) {
        throw new ConflictException(`Email "${dto.email}" đã được đăng ký`);
      }
    }

    Object.assign(student, dto);
    return student;
  }

  remove(id: string): void {
    const index = this.students.findIndex(s => s.id === id);
    if (index === -1) {
      throw new NotFoundException(`Sinh viên với ID "${id}" không tồn tại`);
    }
    this.students.splice(index, 1);
  }
}
```

### Bước 5: Implement controller

```typescript
// src/students/students.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, HttpCode, HttpStatus,
  UsePipes, ValidationPipe,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';

@Controller('students')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  findAll() {
    return this.studentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.studentsService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED) // 201 thay vì 200 mặc định
  create(@Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(createStudentDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateDto: Partial<CreateStudentDto>) {
    return this.studentsService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // 204 — xóa thành công, không có body
  remove(@Param('id') id: string) {
    this.studentsService.remove(id);
  }
}
```

### Bước 6: Enable ValidationPipe globally

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation globally — tự động validate mọi DTO
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,      // Bỏ fields không có trong DTO
    forbidNonWhitelisted: true, // Báo lỗi nếu có field lạ
    transform: true,      // Tự convert kiểu (string "8.5" → number 8.5)
  }));

  await app.listen(3000);
  console.log('Server đang chạy tại http://localhost:3000');
}
bootstrap();
```

### Bước 7: Test với curl

```bash
# Khởi động server
npm run start:dev

# Tạo sinh viên
curl -X POST http://localhost:3000/students \
  -H "Content-Type: application/json" \
  -d '{"hoTen":"Nguyễn Văn An","namSinh":2002,"email":"an@gmail.com","gpa":8.5}'

# Lấy danh sách
curl http://localhost:3000/students

# Lấy theo ID
curl http://localhost:3000/students/1

# Cập nhật
curl -X PUT http://localhost:3000/students/1 \
  -H "Content-Type: application/json" \
  -d '{"gpa":9.0}'

# Xóa
curl -X DELETE http://localhost:3000/students/1

# Test validation — gửi email sai format
curl -X POST http://localhost:3000/students \
  -H "Content-Type: application/json" \
  -d '{"hoTen":"Test","namSinh":2002,"email":"not-an-email"}'
```

---

## Phần 5: Lỗi thường gặp

### Lỗi 1: "Cannot find module" khi import

```
Error: Cannot find module './students/students.module'
```

**Nguyên nhân:** Module chưa được import vào AppModule.

```typescript
// app.module.ts — phải thêm StudentsModule vào imports
@Module({
  imports: [StudentsModule], // ← thêm dòng này
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### Lỗi 2: ValidationPipe không hoạt động

Gửi email sai nhưng không thấy lỗi? Kiểm tra:

1. `npm install class-validator class-transformer` đã chạy chưa?
2. `app.useGlobalPipes(new ValidationPipe())` trong `main.ts` chưa?
3. `@UsePipes` ở controller level (optional nếu đã global)

### Lỗi 3: Circular dependency

```
Error: A circular dependency has been detected (StudentsModule -> CoursesModule -> StudentsModule)
```

**Nguyên nhân:** Module A import Module B, Module B import lại Module A.

**Giải pháp:** Dùng `forwardRef()`:

```typescript
@Module({
  imports: [forwardRef(() => CoursesModule)],
})
export class StudentsModule {}
```

Hoặc tốt hơn — thiết kế lại để tránh circular dependency.

### Lỗi 4: "Nest can't resolve dependencies"

```
Error: Nest can't resolve dependencies of StudentsController (?).
```

**Nguyên nhân:** `StudentsService` chưa được khai báo trong `providers` của module.

```typescript
@Module({
  providers: [StudentsService], // ← kiểm tra dòng này
  controllers: [StudentsController],
})
```

---

## Bài tập thực hành

### Bài tập 1 (Trong lớp — 30 phút)

Thêm validation vào `CreateStudentDto`:
- `hoTen` phải có ít nhất 2 ký tự, tối đa 100 ký tự
- `namSinh` phải từ 1990 đến năm hiện tại
- Thêm field `soDienThoai` optional, regex kiểm tra format VN (0[35789][0-9]{8})

### Bài tập 2 (Về nhà — deadline tuần sau)

Tạo module `Courses` (Môn học) với:

```typescript
interface Course {
  id: string;
  maMon: string;       // "CNTT001"
  tenMon: string;      // "Lập trình Web"
  soTinChi: number;    // 3
  giangVien: string;
}
```

1. Tạo CRUD đầy đủ cho `Courses`
2. Thêm method `dangKy(studentId: string, courseId: string)` vào `StudentsService` — lưu danh sách môn đã đăng ký của mỗi sinh viên
3. Endpoint `GET /students/:id/courses` trả về các môn của sinh viên

**Câu hỏi nâng cao:** Làm sao để `StudentsService` gọi được `CoursesService`? (Gợi ý: export + import module)

---

## Câu hỏi tự kiểm tra

1. TypeScript khác JavaScript ở điểm nào cơ bản nhất?
2. `interface` và `type` trong TypeScript có gì khác nhau?
3. `@Injectable()` có tác dụng gì? Nếu quên thêm thì sao?
4. Dependency Injection giải quyết vấn đề gì so với `new ServiceClass()`?
5. Tại sao Controller không nên chứa business logic?
6. `@Module({ exports: [StudentsService] })` có ý nghĩa gì?
7. `ValidationPipe` với `whitelist: true` làm gì với các field không có trong DTO?

---

## Đọc thêm

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) — tài liệu chính thức, rất rõ
- [NestJS Overview](https://docs.nestjs.com/first-steps) — docs NestJS, có ví dụ chi tiết
- [Dependency Injection Explained](https://en.wikipedia.org/wiki/Dependency_injection) — khái niệm gốc
- [class-validator decorators](https://github.com/typestack/class-validator#validation-decorators) — danh sách đầy đủ các decorator validation
- Source code thực tế: `nestjs-boot/src/common/crud.controller.ts` — xem CrudController abstract class

---

*Tuần tiếp theo: Database & Repository Pattern — kết nối MongoDB thật, không còn in-memory store nữa.*
