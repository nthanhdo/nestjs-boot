# Tuần 2: Database & Repository Pattern

> **Giai đoạn:** Stage 1 — Nền tảng | **Tuần:** 2/4
> **Thời lượng:** 3 giờ (1 giờ lý thuyết + 2 giờ thực hành)
> **Yêu cầu đầu vào:** Hoàn thành Tuần 1 — có module Students chạy được

---

## Mục tiêu học tập

Sau buổi này, sinh viên sẽ có thể:

1. Giải thích tại sao cần database thay vì lưu trong bộ nhớ
2. Phân biệt SQL và NoSQL, biết khi nào nên dùng loại nào
3. Kết nối MongoDB với NestJS qua Mongoose
4. Đọc và hiểu code `BaseRepository` trong nestjs-boot
5. Implement CRUD đầy đủ với pagination, sorting, filtering

---

## Phần 1: Tại sao cần Database? (20 phút)

### 1.1 Vấn đề với in-memory storage

Tuần trước, chúng ta lưu sinh viên trong một mảng JavaScript:

```typescript
private students: Student[] = []; // Lưu trong RAM
```

Hãy nghĩ xem điều gì xảy ra:

| Tình huống | In-memory | Database |
|-----------|-----------|---------|
| Restart server | **Mất hết dữ liệu** ❌ | Còn nguyên ✅ |
| 2 server instance | Không đồng bộ ❌ | Chia sẻ chung ✅ |
| 10,000 records | RAM đầy ❌ | Xử lý được ✅ |
| Tìm kiếm nhanh | O(n) — quét hết ❌ | Index — O(log n) ✅ |
| 2 request cùng lúc | Race condition ❌ | ACID đảm bảo ✅ |

### 1.2 ACID — 4 tính chất của database tốt

**Analogy:** ACID giống như quy trình của ngân hàng khi chuyển tiền.

- **Atomicity (Nguyên tử):** Hoặc tất cả thành công, hoặc tất cả thất bại. Không có "chuyển khoản xong nhưng chưa cộng vào tài khoản đích".
- **Consistency (Nhất quán):** Dữ liệu luôn ở trạng thái hợp lệ. Số dư không thể âm nếu có constraint.
- **Isolation (Cô lập):** 2 transaction song song không ảnh hưởng nhau.
- **Durability (Bền vững):** Sau khi commit, dữ liệu không mất dù server crash.

### 1.3 Indexing — Tại sao tìm kiếm nhanh?

```
Không có index: tìm email "an@gmail.com" trong 1 triệu records
→ Quét từng record: record 1, 2, 3, ..., 734521 → tìm thấy!
→ Worst case: 1,000,000 phép so sánh

Có index trên email (B-tree):
→ Binary search: 500,000 → 250,000 → ... → tìm thấy sau ~20 bước
→ log₂(1,000,000) ≈ 20 phép so sánh — nhanh hơn 50,000 lần!
```

---

## Phần 2: SQL vs NoSQL — Khi nào dùng gì? (20 phút)

### 2.1 Đừng nghe "NoSQL tốt hơn SQL"

Đây là một misconception phổ biến. **Cả hai đều là công cụ, phù hợp cho bài toán khác nhau.**

### 2.2 SQL (PostgreSQL, MySQL) — Dùng khi:

```sql
-- Dữ liệu có cấu trúc cố định, có quan hệ rõ ràng
-- Ví dụ: hệ thống quản lý trường học

students: { id, name, email, class_id }
classes:  { id, name, teacher_id }
grades:   { student_id, subject_id, score }

-- Query phức tạp với JOIN:
SELECT s.name, AVG(g.score) as gpa
FROM students s
JOIN grades g ON s.id = g.student_id
GROUP BY s.id
HAVING AVG(g.score) > 8.0;
```

**Phù hợp cho:** E-commerce (orders, products, inventory), tài chính, ERP, bất kỳ domain nào cần ACID mạnh và JOIN nhiều bảng.

### 2.3 NoSQL/MongoDB — Dùng khi:

```javascript
// Dữ liệu thay đổi cấu trúc thường xuyên, hoặc lồng nhau tự nhiên
// Ví dụ: profile sản phẩm trên marketplace
{
  _id: "prod_001",
  name: "iPhone 15",
  specs: {          // Mỗi sản phẩm có specs khác nhau
    storage: "256GB",
    camera: "48MP",
    color: ["Black", "White", "Blue"]
  },
  reviews: [        // Lồng reviews thay vì join bảng khác
    { user: "An", rating: 5, comment: "Tốt lắm" },
    { user: "Bình", rating: 4, comment: "Ổn" }
  ],
  tags: ["smartphone", "apple", "5G"]
}
```

**Phù hợp cho:** Product catalog, user profiles, content/articles, real-time analytics, IoT data.

### 2.4 Quyết định nhanh

```
Dữ liệu có quan hệ phức tạp (nhiều bảng JOIN) → SQL
Dữ liệu lồng nhau tự nhiên, schema hay thay đổi → MongoDB
Cần full-text search nâng cao → Elasticsearch
Cần đọc cực nhanh, đơn giản → Redis
Không chắc? → Dùng PostgreSQL, dễ migrate sau
```

**Khóa học này dùng MongoDB** vì nestjs-boot được build cho MongoDB, và MongoDB phù hợp cho nhiều loại web app hiện đại.

---

## Phần 3: MongoDB & Mongoose (25 phút)

### 3.1 Khái niệm cơ bản

| SQL | MongoDB | Giải thích |
|-----|---------|-----------|
| Database | Database | Tập hợp lớn nhất |
| Table | Collection | Nhóm dữ liệu cùng loại |
| Row | Document | 1 đơn vị dữ liệu |
| Column | Field | Thuộc tính của document |
| Primary Key | `_id` | Định danh duy nhất |
| Index | Index | Tăng tốc tìm kiếm |

### 3.2 Document — Linh hoạt hơn Row

```javascript
// Trong SQL, mọi row phải có cùng cột
// MongoDB document có thể khác nhau trong cùng collection:

{ _id: "sv1", hoTen: "An", email: "an@gmail.com", gpa: 8.5 }
{ _id: "sv2", hoTen: "Bình", email: "binh@gmail.com" }  // không có gpa
{ _id: "sv3", hoTen: "Chi", email: "chi@gmail.com", diaChi: "HN" }  // thêm field
```

### 3.3 Mongoose — Schema trên MongoDB

Mongoose thêm **schema validation** vào MongoDB — giúp đảm bảo dữ liệu có cấu trúc nhất định:

```typescript
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Document type = Schema + Mongoose Document methods
export type StudentDocument = Student & Document;

@Schema({
  timestamps: true,  // Tự thêm createdAt, updatedAt
  collection: 'students', // Tên collection trong MongoDB
})
export class Student {
  @Prop({ required: true, trim: true })
  hoTen: string;

  @Prop({ required: true, min: 1990, max: 2010 })
  namSinh: number;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ min: 0, max: 10 })
  gpa?: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const StudentSchema = SchemaFactory.createForClass(Student);

// Thêm index để tìm kiếm nhanh
StudentSchema.index({ email: 1 }, { unique: true });
StudentSchema.index({ hoTen: 'text' }); // Full-text search
```

### 3.4 Multi-connection trong nestjs-boot

nestjs-boot hỗ trợ nhiều database connection đồng thời — quan trọng cho production.

Xem file `src/database/connection.factory.ts`:

```typescript
// connection.factory.ts — tạo các Mongoose connection
export function createConnectionModules(options: DatabaseOptions): DynamicModule[] {
  const modules: DynamicModule[] = [];

  for (const [name, connectionConfig] of Object.entries(options.connections)) {
    // Writer connection — dùng để ghi dữ liệu
    const writerConnName = getWriterConnectionName(name);
    modules.push(
      MongooseModule.forRoot(connectionConfig.writerUri, {
        connectionName: writerConnName,
        connectionFactory: (connection) => {
          connection.on('connected', () => {
            logger.log(`[${name}] Writer connection established`);
          });
          // ...
          return connection;
        },
      }),
    );

    // Reader connection — dùng để đọc (nếu có)
    // Giúp phân tải: write đến primary, read từ replica
    if (connectionConfig.readerUri) {
      // ... tạo reader connection riêng
    }
  }

  return modules;
}
```

**Tại sao cần reader/writer split?**
- **Writer** → MongoDB Primary: đảm bảo consistency, ACID
- **Reader** → MongoDB Replica: giảm tải cho primary, scale read operations
- Đây là pattern chuẩn trong production system

---

## Phần 4: Repository Pattern (25 phút)

### 4.1 Vấn đề khi không có Repository

```typescript
// Không có Repository — tất cả trong Service
class StudentsService {
  constructor(
    @InjectModel('Student') private studentModel: Model<StudentDocument>,
  ) {}

  async findActiveStudents() {
    // Business logic lẫn với MongoDB query
    return this.studentModel
      .find({ isActive: true })
      .sort({ hoTen: 1 })
      .limit(20)
      .exec();
  }

  async findStudentsByGpa(minGpa: number) {
    // Lại MongoDB query nữa
    return this.studentModel
      .find({ gpa: { $gte: minGpa } })
      .exec();
  }
}
```

**Vấn đề:**
1. Service bị phụ thuộc trực tiếp vào Mongoose — khó test
2. Muốn đổi sang PostgreSQL sau? Phải sửa toàn bộ Service
3. Duplicate logic query nếu nhiều Service cùng query một Model

### 4.2 Repository Pattern — Tách biệt data access

```
Client Request
     ↓
Controller (HTTP layer)
     ↓
Service (Business Logic) ← không biết gì về MongoDB
     ↓
Repository (Data Access) ← biết về MongoDB, Mongoose
     ↓
Database
```

### 4.3 BaseRepository trong nestjs-boot

File `src/database/base.repository.ts` implement pattern này. Đây là code thực tế của framework:

```typescript
// Trích từ src/database/base.repository.ts

export class BaseRepository<T extends Document> {
  protected readonly readerModel: Model<T> | null;
  protected readonly writerModel: Model<T>;

  constructor(writerModel: Model<T>, readerModel?: Model<T>) {
    this.writerModel = writerModel;
    this.readerModel = readerModel ?? null;
  }

  // READ luôn dùng readerModel (nếu có) để giảm tải primary
  protected get readModel(): Model<T> {
    return this.readerModel ?? this.writerModel;
  }

  // findAll với pagination đầy đủ
  async findAll(
    filter: FilterQuery<T> = {},
    options: FindAllOptions = {},
  ): Promise<PaginatedResult<T>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const query = this.readModel.find(filter).skip(skip).limit(limit);

    if (options.sort) query.sort(options.sort);
    if (options.select) query.select(options.select);

    // Promise.all — chạy song song để nhanh hơn
    const [data, total] = await Promise.all([
      query.exec() as Promise<T[]>,
      this.readModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string): Promise<T | null> {
    return this.readModel.findById(id).exec();
  }

  async create(data: Partial<T>): Promise<T> {
    const doc = new this.writerModel(data);
    return doc.save(); // WRITE luôn dùng writerModel
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    return this.writerModel
      .findByIdAndUpdate(id, data as UpdateQuery<T>, { new: true })
      // { new: true } → trả về document SAU KHI update, không phải trước
      .exec();
  }

  async delete(id: string): Promise<T | null> {
    return this.writerModel.findByIdAndDelete(id).exec();
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const result = await this.readModel.exists(filter);
    return result !== null;
  }

  // Aggregation pipeline cho queries phức tạp
  async aggregate(pipeline: PipelineStage[]): Promise<unknown[]> {
    return this.readModel.aggregate(pipeline).exec();
  }
}
```

**Tại sao `{ new: true }` trong `findByIdAndUpdate`?**

Mặc định Mongoose trả về document trước khi update. Với `{ new: true }`, nó trả về document sau khi update — thường là thứ chúng ta muốn trả về cho client.

---

## Phần 5: Hands-on — Kết nối MongoDB (60 phút)

### Bước 1: Khởi động MongoDB (local)

```bash
# Option A: Docker (khuyến nghị)
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:7

# Option B: MongoDB Atlas (free cloud)
# Đăng ký tại: https://www.mongodb.com/cloud/atlas
# Tạo cluster free, copy connection string
```

### Bước 2: Cài packages

```bash
npm install @nestjs/mongoose mongoose
npm install --save-dev @types/mongoose
```

### Bước 3: Tạo Student Schema

```typescript
// src/students/student.schema.ts
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StudentDocument = Student & Document;

@Schema({ timestamps: true, collection: 'students' })
export class Student {
  @Prop({ required: true, trim: true, minlength: 2, maxlength: 100 })
  hoTen: string;

  @Prop({ required: true })
  namSinh: number;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ min: 0, max: 10 })
  gpa?: number;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const StudentSchema = SchemaFactory.createForClass(Student);

// Compound index — tìm sinh viên đang học theo GPA
StudentSchema.index({ isActive: 1, gpa: -1 });
```

### Bước 4: Tạo Student Repository

```typescript
// src/students/students.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository, PaginatedResult } from 'nestjs-boot'; // hoặc copy class
import { Student, StudentDocument } from './student.schema';

export interface StudentFilter {
  isActive?: boolean;
  minGpa?: number;
  maxGpa?: number;
  namSinh?: number;
  search?: string; // Tìm theo tên
}

@Injectable()
export class StudentsRepository extends BaseRepository<StudentDocument> {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
  ) {
    super(studentModel); // Truyền model cho BaseRepository
  }

  // Override findAll với filter tùy chỉnh
  async findWithFilter(
    filter: StudentFilter,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<StudentDocument>> {
    const query: Record<string, any> = {};

    if (filter.isActive !== undefined) {
      query.isActive = filter.isActive;
    }
    if (filter.minGpa !== undefined || filter.maxGpa !== undefined) {
      query.gpa = {};
      if (filter.minGpa !== undefined) query.gpa.$gte = filter.minGpa;
      if (filter.maxGpa !== undefined) query.gpa.$lte = filter.maxGpa;
    }
    if (filter.namSinh) {
      query.namSinh = filter.namSinh;
    }
    if (filter.search) {
      // Case-insensitive search trên tên
      query.hoTen = { $regex: filter.search, $options: 'i' };
    }

    return this.findAll(query, {
      page,
      limit,
      sort: { hoTen: 1 }, // Sort theo tên A-Z
    });
  }

  // Soft delete — đánh dấu inactive thay vì xóa thật
  async softDelete(id: string): Promise<StudentDocument | null> {
    return this.studentModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  // Tìm theo email
  async findByEmail(email: string): Promise<StudentDocument | null> {
    return this.findOne({ email: email.toLowerCase() });
  }

  // Thống kê GPA
  async getGpaStats(): Promise<{ avg: number; min: number; max: number }> {
    const result = await this.aggregate([
      { $match: { isActive: true, gpa: { $exists: true } } },
      {
        $group: {
          _id: null,
          avg: { $avg: '$gpa' },
          min: { $min: '$gpa' },
          max: { $max: '$gpa' },
        },
      },
    ]);

    if (!result.length) return { avg: 0, min: 0, max: 0 };
    const stats = result[0] as any;
    return {
      avg: Math.round(stats.avg * 100) / 100,
      min: stats.min,
      max: stats.max,
    };
  }
}
```

### Bước 5: Cập nhật StudentsService

```typescript
// src/students/students.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { StudentsRepository, StudentFilter } from './students.repository';
import { StudentDocument } from './student.schema';
import { CreateStudentDto } from './dto/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly studentsRepository: StudentsRepository) {}

  async findAll(filter: StudentFilter, page = 1, limit = 20) {
    return this.studentsRepository.findWithFilter(filter, page, limit);
  }

  async findById(id: string): Promise<StudentDocument> {
    const student = await this.studentsRepository.findById(id);
    if (!student) {
      throw new NotFoundException(`Sinh viên với ID "${id}" không tồn tại`);
    }
    return student;
  }

  async create(dto: CreateStudentDto): Promise<StudentDocument> {
    // Check email unique
    const exists = await this.studentsRepository.findByEmail(dto.email);
    if (exists) {
      throw new ConflictException(`Email "${dto.email}" đã được đăng ký`);
    }

    return this.studentsRepository.create(dto as Partial<StudentDocument>);
  }

  async update(id: string, dto: Partial<CreateStudentDto>): Promise<StudentDocument> {
    // Kiểm tra tồn tại
    await this.findById(id);

    // Nếu đổi email, check unique
    if (dto.email) {
      const existing = await this.studentsRepository.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Email "${dto.email}" đã được đăng ký`);
      }
    }

    const updated = await this.studentsRepository.update(
      id,
      dto as Partial<StudentDocument>,
    );
    return updated!;
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id); // Đảm bảo tồn tại
    await this.studentsRepository.softDelete(id);
  }

  async getStats() {
    return this.studentsRepository.getGpaStats();
  }
}
```

### Bước 6: Cập nhật Module

```typescript
// src/students/students.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentsRepository } from './students.repository';
import { Student, StudentSchema } from './student.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService, StudentsRepository],
  exports: [StudentsService],
})
export class StudentsModule {}
```

### Bước 7: Kết nối MongoDB trong AppModule

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/student_db?authSource=admin',
    ),
    StudentsModule,
  ],
})
export class AppModule {}
```

### Bước 8: Cập nhật Controller với query params

```typescript
// src/students/students.controller.ts
import { Controller, Get, Query, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('minGpa') minGpa?: string,
    @Query('maxGpa') maxGpa?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.studentsService.findAll(
      {
        search,
        minGpa: minGpa ? parseFloat(minGpa) : undefined,
        maxGpa: maxGpa ? parseFloat(maxGpa) : undefined,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      },
      parseInt(page),
      parseInt(limit),
    );
  }

  @Get('stats')
  getStats() {
    return this.studentsService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.studentsService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(createStudentDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateDto: Partial<CreateStudentDto>) {
    return this.studentsService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.studentsService.softDelete(id);
  }
}
```

### Bước 9: Test với curl

```bash
# Tạo sinh viên
curl -X POST http://localhost:3000/students \
  -H "Content-Type: application/json" \
  -d '{"hoTen":"Nguyễn Văn An","namSinh":2002,"email":"an@gmail.com","gpa":8.5}'

# Lấy danh sách (có pagination)
curl "http://localhost:3000/students?page=1&limit=10"

# Lọc theo GPA
curl "http://localhost:3000/students?minGpa=8.0&maxGpa=9.0"

# Tìm kiếm theo tên
curl "http://localhost:3000/students?search=nguy"

# Thống kê GPA
curl http://localhost:3000/students/stats

# Soft delete
curl -X DELETE http://localhost:3000/students/STUDENT_ID_HERE
```

---

## Phần 6: Lỗi thường gặp

### Lỗi 1: Connection refused

```
MongoServerError: connect ECONNREFUSED 127.0.0.1:27017
```

**Nguyên nhân:** MongoDB chưa chạy.

```bash
# Kiểm tra container
docker ps | grep mongo

# Khởi động lại
docker start mongodb

# Xem logs nếu vẫn lỗi
docker logs mongodb
```

### Lỗi 2: Authentication failed

```
MongoServerError: Authentication failed
```

**Nguyên nhân:** Username/password sai, hoặc `authSource` sai.

```
# Connection string phải có authSource=admin nếu tạo user ở admin DB
mongodb://admin:password@localhost:27017/student_db?authSource=admin
```

### Lỗi 3: Document validation error

```
ValidationError: Student validation failed: email: Path `email` is required
```

**Nguyên nhân:** Gửi request thiếu field required trong Schema.

**Quan trọng:** Có 2 lớp validation:
1. **class-validator** (DTO) — validate request body trước khi vào Service
2. **Mongoose Schema** (`@Prop({ required: true })`) — validate trước khi lưu vào DB

Nên dùng cả hai — class-validator cho error message thân thiện hơn với user.

### Lỗi 4: CastError — ID không hợp lệ

```
CastError: Cast to ObjectId failed for value "abc" at path "_id"
```

**Nguyên nhân:** MongoDB ID phải là 24-char hex string (ObjectId format).

```typescript
// Validate ID trước khi query
import { isValidObjectId } from 'mongoose';

async findById(id: string): Promise<StudentDocument> {
  if (!isValidObjectId(id)) {
    throw new BadRequestException(`ID "${id}" không hợp lệ`);
  }
  const student = await this.studentsRepository.findById(id);
  // ...
}
```

### Lỗi 5: Duplicate key error

```
MongoServerError: E11000 duplicate key error collection: student_db.students index: email_1
```

**Nguyên nhân:** Cố insert document với email đã tồn tại (có unique index).

**Xử lý đúng:** Catch lỗi Mongoose ở tầng service hoặc dùng error transformer của nestjs-boot:

```typescript
// src/common/mongoose-error.transformer.ts (có trong nestjs-boot)
// Tự động convert MongoServerError 11000 → ConflictException 409
```

---

## Bài tập thực hành

### Bài tập 1 (Trong lớp — 30 phút)

Thêm vào `StudentsRepository`:
1. `findByNamSinh(year: number)` — tìm tất cả sinh viên sinh năm X
2. `countActive()` — đếm số sinh viên đang học
3. `findTopStudents(n: number)` — lấy top N sinh viên GPA cao nhất

### Bài tập 2 (Về nhà — deadline tuần sau)

Tạo `CoursesRepository` và `CourseSchema` với:

```typescript
// Course schema:
// - maMon: string (unique, required)
// - tenMon: string (required)
// - soTinChi: number (1-5)
// - giangVien: string
// - isActive: boolean (default: true)
// - createdAt, updatedAt: auto

// Repository methods:
// - findByGiangVien(giangVien: string)
// - findByTinChi(min: number, max: number)
// - getStats() — tổng số môn, tổng số tín chỉ
```

**Thách thức nâng cao:** Tạo `EnrollmentSchema` lưu quan hệ many-to-many giữa Student và Course:

```typescript
// enrollment: { studentId, courseId, enrolledAt, grade? }
```

---

## Câu hỏi tự kiểm tra

1. Tại sao lưu dữ liệu trong RAM (`private students = []`) là không đủ cho production?
2. Sự khác biệt chính giữa SQL và MongoDB là gì? Khi nào dùng cái nào?
3. Repository Pattern giải quyết vấn đề gì?
4. Tại sao `BaseRepository` phân biệt `readerModel` và `writerModel`?
5. `{ new: true }` trong `findByIdAndUpdate` có nghĩa gì?
6. Soft delete khác hard delete thế nào? Khi nào dùng soft delete?
7. `Promise.all([query.exec(), countDocuments.exec()])` tốt hơn chạy tuần tự thế nào?
8. Tại sao cần index trên `email`? Điều gì xảy ra nếu không có index khi có 1 triệu records?

---

## Đọc thêm

- [MongoDB University Free Courses](https://learn.mongodb.com/) — courses chính thức từ MongoDB
- [Mongoose Documentation](https://mongoosejs.com/docs/guide.html) — Schema, Model, Query
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html) — Martin Fowler giải thích gốc
- [Why ACID?](https://en.wikipedia.org/wiki/ACID) — database transactions
- nestjs-boot source: `src/database/base.repository.ts` — đọc toàn bộ file, chú ý comments
- nestjs-boot source: `src/database/connection.factory.ts` — xem cách tạo reader/writer connections

---

*Tuần tiếp theo: API Design & Validation — thiết kế REST API chuẩn, xử lý error đúng cách, auto-generate docs.*
