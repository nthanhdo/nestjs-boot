# Database

## Tổng quan

`DatabaseModule` cung cấp MongoDB hướng cấu hình với hỗ trợ multi-connection và tự động phân tách reader/writer. Xây dựng trên `@nestjs/mongoose` và Mongoose.

## Thiết lập

### Kết nối đơn

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: 'mongodb://localhost:27017/myapp',
      },
    },
  },
});
```

### Phân tách reader/writer

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: 'mongodb://primary:27017/myapp',
        readerUri: 'mongodb://secondary:27017/myapp',
        options: {
          maxPoolSize: 20,
          minPoolSize: 5,
          retryWrites: true,
        },
      },
    },
  },
});
```

Khi `readerUri` được cung cấp, tất cả thao tác đọc (`find`, `count`, `aggregate`, `exists`) tự động chuyển đến reader connection. Tất cả thao tác ghi luôn đi qua writer.

### Nhiều kết nối

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: { writerUri: 'mongodb://localhost:27017/myapp' },
      analytics: { writerUri: 'mongodb://localhost:27017/analytics' },
      logs: { writerUri: 'mongodb://localhost:27017/logs' },
    },
  },
});
```

### Tùy chọn kết nối

| Option | Type | Mô tả |
|--------|------|-------------|
| `writerUri` | `string` | URI MongoDB chính (bắt buộc) |
| `readerUri` | `string` | URI read-replica (optional) |
| `options.maxPoolSize` | `number` | Kích thước connection pool tối đa |
| `options.minPoolSize` | `number` | Kích thước connection pool tối thiểu |
| `options.serverSelectionTimeoutMS` | `number` | Timeout chọn server |
| `options.socketTimeoutMS` | `number` | Timeout socket |
| `options.connectTimeoutMS` | `number` | Timeout kết nối |
| `options.retryWrites` | `boolean` | Bật retryable write |
| `options.retryReads` | `boolean` | Bật retryable read |
| `options.replicaSet` | `string` | Tên replica set |
| `options.readPreference` | `string` | Read preference |
| `options.ssl` | `boolean` | Bật SSL |
| `options.authSource` | `string` | Database xác thực |

## Đăng ký schema

Dùng `DatabaseModule.forFeature()` để đăng ký Mongoose schema trên connection có tên. Schema tự động được đăng ký trên cả writer và reader connection.

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: Product.name, schema: ProductSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
})
export class ProductModule {}
```

Throw lỗi nếu tên connection chưa được đăng ký qua `DatabaseModule.register()`.

## BaseRepository

Repository tổng quát với tự động định tuyến reader/writer.

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'nestjs-boot';

@Injectable()
export class ProductRepository extends BaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name) writerModel: Model<ProductDocument>,
    // Inject reader model if reader/writer split is configured
  ) {
    super(writerModel);
  }
}
```

### API

| Method | Signature | Định tuyến đến |
|--------|-----------|-----------|
| `findAll` | `findAll(filter?, options?): Promise<PaginatedResult<T>>` | Reader |
| `findById` | `findById(id: string): Promise<T \| null>` | Reader |
| `findOne` | `findOne(filter): Promise<T \| null>` | Reader |
| `count` | `count(filter?): Promise<number>` | Reader |
| `exists` | `exists(filter): Promise<boolean>` | Reader |
| `aggregate` | `aggregate(pipeline): Promise<unknown[]>` | Reader |
| `create` | `create(data): Promise<T>` | Writer |
| `createMany` | `createMany(data[]): Promise<T[]>` | Writer |
| `update` | `update(id, data): Promise<T \| null>` | Writer |
| `updateMany` | `updateMany(filter, data): Promise<{ modifiedCount }>` | Writer |
| `delete` | `delete(id): Promise<T \| null>` | Writer |
| `deleteMany` | `deleteMany(filter): Promise<{ deletedCount }>` | Writer |

### FindAllOptions

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `page` | `number` | 1 | Số trang (bắt đầu từ 1) |
| `limit` | `number` | 20 | Số item mỗi trang |
| `sort` | `Record<string, 1 \| -1>` | — | Trường sắp xếp |
| `select` | `string \| Record<string, 0 \| 1>` | — | Phép chiếu trường |

```ts
const result = await productRepo.findAll(
  { isActive: true },
  { page: 2, limit: 10, sort: { createdAt: -1 }, select: 'name price' },
);
// result: { data: Product[], total: number, page: 2, limit: 10 }
```

## CachedBaseRepository

Mở rộng `BaseRepository` với cache-aside tự động. Các method đọc kiểm tra cache trước (key MD5 theo collection + method + args). Các method ghi invalidate cache theo prefix collection.

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CachedBaseRepository, MultiCacheService } from 'nestjs-boot';

@Injectable()
export class ProductRepository extends CachedBaseRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name) writerModel: Model<ProductDocument>,
    cacheService: MultiCacheService,
  ) {
    super(writerModel, undefined, cacheService, 600); // 600s TTL
  }
}
```

Cache key theo pattern `{collectionName}:{method}:{md5(args)}`. Tất cả thao tác ghi (`create`, `update`, `delete`, v.v.) gọi `delByPrefix(collectionName)` để invalidate toàn bộ cache của collection.

## Specification pattern

Bộ lọc query có thể kết hợp và tái sử dụng theo Specification pattern. Mỗi specification tạo ra một Mongoose `FilterQuery`.

```ts
import { Specification } from 'nestjs-boot';
import { FilterQuery } from 'mongoose';

class IsActiveSpec extends Specification<Product> {
  toFilter(): FilterQuery<Product> {
    return { isActive: true };
  }
}

class InCategorySpec extends Specification<Product> {
  constructor(private category: string) { super(); }
  toFilter(): FilterQuery<Product> {
    return { category: this.category };
  }
}

class PriceRangeSpec extends Specification<Product> {
  constructor(private min: number, private max: number) { super(); }
  toFilter(): FilterQuery<Product> {
    return { price: { $gte: this.min, $lte: this.max } };
  }
}

// Compose with and/or/not
const spec = new IsActiveSpec()
  .and(new InCategorySpec('electronics'))
  .and(new PriceRangeSpec(10, 100));

const results = await repo.findAll(spec.toFilter());
```

### Toán tử

| Method | Toán tử Mongo | Mô tả |
|--------|---------------|-------------|
| `and(other)` | `$and` | Cả hai spec phải khớp |
| `or(other)` | `$or` | Một trong hai spec khớp |
| `not()` | `$nor` | Phủ định spec |

## UnitOfWork

Gói nhiều thao tác repository trong một MongoDB transaction. Yêu cầu replica set.

```ts
import { Injectable } from '@nestjs/common';
import { UnitOfWork } from 'nestjs-boot';

@Injectable()
export class OrderService {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async placeOrder(data: CreateOrderDto) {
    return this.unitOfWork.execute(async (session) => {
      const order = await this.orderRepo.create(data, { session });
      await this.inventoryRepo.decrement(data.productId, data.qty, { session });
      await this.paymentRepo.charge(data.userId, data.total, { session });
      return order;
    });
    // All succeed or all rollback
  }
}
```

Method `execute()` khởi tạo session, bắt đầu transaction, chạy callback, commit khi thành công, và abort khi lỗi. Session luôn được kết thúc trong block `finally`.

## Migration

### Interface Migration

```ts
import { Migration } from 'nestjs-boot';
import mongoose from 'mongoose';

const addEmailIndex: Migration = {
  version: '2026-08-07-001',
  name: 'add-email-index',
  async up(db: mongoose.Connection) {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
  },
  async down(db: mongoose.Connection) {
    await db.collection('users').dropIndex('email_1');
  },
};
```

Định dạng version: prefix ngày (`2026-08-07-001`) hoặc semantic (`1.0.0`). Migration được sắp xếp và thực thi theo thứ tự version tăng dần.

### MigrationModule

```ts
import { MigrationModule } from 'nestjs-boot';
import { addEmailIndex } from './migrations/add-email-index';

@Module({
  imports: [
    MigrationModule.register({
      connection: 'master',
      migrations: [addEmailIndex],
      autoRun: false, // recommended — run via CLI instead
    }),
  ],
})
export class AppModule {}
```

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `connection` | `string` | — | Connection có tên từ `DatabaseModule.register()` |
| `migrations` | `Migration[]` | — | Các instance migration |
| `autoRun` | `boolean` | `false` | Chạy migration pending khi app khởi động |

### API MigrationRunner

| Method | Signature | Mô tả |
|--------|-----------|-------------|
| `migrate` | `migrate(): Promise<MigrationResult[]>` | Chạy tất cả migration pending |
| `rollback` | `rollback(count?: number): Promise<MigrationResult[]>` | Hoàn tác N migration gần nhất (mặc định 1) |
| `status` | `status(): Promise<MigrationStatus[]>` | Liệt kê tất cả migration với trạng thái applied/pending |

Migration đã áp dụng được theo dõi trong collection `_migrations`. Runner dừng khi gặp lỗi đầu tiên — các migration sau có thể phụ thuộc vào migration bị lỗi.

## Best Practices

- **Luôn dùng reader/writer split trong production** — kể cả khi cả hai trỏ đến cùng URI ban đầu. Thêm replica sau này không cần thay đổi code.
- **Dùng Specification cho query phức tạp** — kết hợp các spec tái sử dụng thay vì xây filter object inline. Dễ test và bảo trì hơn.
- **Ưu tiên CachedBaseRepository cho collection đọc nhiều** — cache-aside tự động với zero boilerplate.
- **Đặt `autoRun: false` cho migration** — chạy migration rõ ràng qua CLI hoặc startup script. Tự động chạy trong production với nhiều replica có thể gây race condition.
- **Dùng UnitOfWork cho ghi nhiều document** — MongoDB transaction yêu cầu replica set. Cấu hình replica set ngay cả trong development.

## Lưu ý quan trọng

- **MongoDB standalone + transaction** — `UnitOfWork.execute()` yêu cầu replica set. MongoDB standalone không hỗ trợ multi-document transaction. Dùng `mongod --replSet rs0` trong development.
- **Tên connection không tồn tại** — `DatabaseModule.forFeature('typo', [...])` throw ngay lập tức kèm danh sách connection đã đăng ký.
- **Phạm vi invalidate cache** — `CachedBaseRepository` invalidate toàn bộ prefix collection khi có bất kỳ thao tác ghi nào. Điều này đúng nhưng khá mạnh tay. Để invalidate chi tiết hơn, dùng `TaggedCacheService`.
- **Thiếu `down()` trong migration** — `rollback()` bỏ qua migration không có method `down()` (trạng thái: `skipped`). Luôn implement `down()` cho migration có thể hoàn tác.
