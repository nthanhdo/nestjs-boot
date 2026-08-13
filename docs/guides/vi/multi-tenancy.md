# Multi-Tenancy

nestjs-boot cung cấp multi-tenancy tùy chọn kích hoạt với chiến lược trích xuất tenant có thể thay thế, ba mô hình cách ly dữ liệu, và repository tự động theo phạm vi tenant. Module không ảnh hưởng gì đến ứng dụng không cấu hình nó.

## Cài đặt

```ts
import { TenancyModule } from 'nestjs-boot/tenancy';

@Module({
  imports: [
    TenancyModule.register({
      strategy: 'header',       // cách trích xuất tenant ID
      headerName: 'X-Tenant-ID', // mặc định cho chiến lược header
      isolation: 'row',          // mô hình cách ly dữ liệu
    }),
  ],
})
export class AppModule {}
```

Module đăng ký middleware trên tất cả route để trích xuất tenant ID và lưu vào AsyncLocalStorage trong suốt thời gian xử lý request.

## Chiến lược trích xuất Tenant

### Header (mặc định)

Đọc tenant ID từ request header:

```ts
TenancyModule.register({
  strategy: 'header',
  headerName: 'X-Tenant-ID', // mặc định
  isolation: 'row',
})
```

```bash
curl -H "X-Tenant-ID: acme" http://localhost:3000/products
```

### Subdomain

Trích xuất nhãn subdomain đầu tiên:

```ts
TenancyModule.register({
  strategy: 'subdomain',
  isolation: 'row',
})
```

`acme.api.example.com` phân giải thành tenant `acme`. Host có ít hơn 3 nhãn (ví dụ `api.example.com`) không phân giải được tenant và request bị từ chối.

### Path

Đọc segment đầu tiên trong URL path:

```ts
TenancyModule.register({
  strategy: 'path',
  isolation: 'row',
})
```

`/acme/products` phân giải thành tenant `acme`.

### Resolver tùy chỉnh

Ghi đè chiến lược có sẵn bằng hàm:

```ts
TenancyModule.register({
  strategy: 'header', // bị bỏ qua khi có resolver
  isolation: 'row',
  resolver: (req) => {
    // Trích xuất tenant từ JWT
    const token = req.headers.authorization?.split(' ')[1];
    const payload = jwt.decode(token);
    return payload?.tenantId ?? null; // null = từ chối request
  },
})
```

Trả về `null` hoặc `undefined` từ resolver khiến middleware từ chối request với mã 401.

## Truy cập Tenant ID

### TenantContext Service

```ts
import { TenantContext } from 'nestjs-boot/tenancy';

@Injectable()
export class BillingService {
  constructor(private readonly tenantContext: TenantContext) {}

  async getBill() {
    const tenantId = this.tenantContext.getTenantId(); // ném lỗi nếu không có ngữ cảnh
    const maybeId = this.tenantContext.getTenantIdOrUndefined(); // phiên bản an toàn
    return this.repo.findBill(tenantId);
  }
}
```

### Decorator @CurrentTenant

```ts
import { CurrentTenant } from 'nestjs-boot/tenancy';

@Controller('products')
export class ProductController {
  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.productService.findAll(tenantId);
  }
}
```

### Hàm độc lập

Cho ngữ cảnh ngoài DI (tiện ích, middleware):

```ts
import { getTenantId, runWithTenant } from 'nestjs-boot/tenancy';

// Đọc tenant hiện tại
const id = getTenantId(); // string | undefined

// Chạy code trong ngữ cảnh tenant (background job, test)
runWithTenant('acme', () => {
  // getTenantId() trả về 'acme' ở đây
  processJob();
});
```

## Chiến lược cách ly dữ liệu

### Cách ly theo hàng (Row Isolation - mặc định)

Tất cả tenant chia sẻ cùng collection MongoDB. Mỗi document có trường `tenantId`. Query tự động được giới hạn theo phạm vi.

```ts
TenancyModule.register({ strategy: 'header', isolation: 'row' })
```

Đánh đổi: không tốn thêm hạ tầng, dễ suy luận nhất, phân tích liên tenant thuận tiện. Index kết hợp phải có `tenantId` làm khóa đầu.

### Cách ly theo Schema

Database chia sẻ, nhưng mỗi tenant có collection với tiền tố riêng: `tenant_acme_products`, `tenant_acme_orders`.

```ts
TenancyModule.register({ strategy: 'header', isolation: 'schema' })
```

```ts
import { SchemaIsolation } from 'nestjs-boot/tenancy';

const schema = new SchemaIsolation('tenant'); // tiền tố
schema.getCollectionName('orders', 'acme'); // 'tenant_acme_orders'
```

Đánh đổi: cách ly logic mạnh hơn, chia sẻ connection pool, dễ backup từng tenant. Số lượng collection tăng theo tenant x model.

### Cách ly theo Database

Mỗi tenant có database MongoDB riêng. Dùng cho yêu cầu pháp lý/tuân thủ.

```ts
import { DatabaseIsolation } from 'nestjs-boot/tenancy';

const isolation = new DatabaseIsolation(
  (tenantId) => `mongodb://localhost:27017/app_${tenantId}`,
);

// Lấy hoặc tạo kết nối theo nhu cầu
const conn = await isolation.getConnection('acme', mongoose);

// Loại bỏ kết nối không dùng
await isolation.evict('acme');

// Theo dõi số lượng kết nối
console.log(isolation.connectionCount);
```

DatabaseIsolation không được TenancyModule tự động đăng ký vì nó cần `uriFactory`. Khởi tạo trực tiếp.

Lưu ý: mỗi tenant mở connection pool riêng. Atlas M10 hỗ trợ ~500 kết nối; với kích thước pool mặc định, giới hạn ~250 tenant đồng thời. Triển khai LRU eviction cho production.

## TenantAwareRepository

Bọc Mongoose model để tự động giới hạn phạm vi tất cả thao tác CRUD theo tenant:

```ts
import { TenantAwareRepository } from 'nestjs-boot/tenancy';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class ProductRepository extends TenantAwareRepository<Product> {
  constructor(@InjectModel(Product.name) model: Model<Product>) {
    super(model);
    // Hoặc: super(model, { requireTenant: true }) để ném lỗi thay vì cảnh báo
  }
}
```

Tất cả phương thức tự động inject `{ tenantId }`:

```ts
// Tất cả đều tự động giới hạn theo tenant hiện tại:
await repo.findAll({ status: 'active' });
await repo.findOne({ sku: 'ABC' });
await repo.findById('507f1f77bcf86cd799439011');
await repo.create({ name: 'Widget', price: 9.99 });
await repo.updateOne({ sku: 'ABC' }, { $set: { price: 12.99 } });
await repo.updateMany({ status: 'draft' }, { $set: { status: 'active' } });
await repo.deleteOne({ sku: 'ABC' });
await repo.deleteMany({ status: 'archived' });
await repo.count({ status: 'active' });
```

Nếu không có ngữ cảnh tenant (ví dụ background job), repository ghi cảnh báo và chạy không giới hạn phạm vi. Truyền `{ requireTenant: true }` để ném lỗi thay thế.

## TenantGuard và @TenantRequired

Bắt buộc một số route phải có ngữ cảnh tenant hợp lệ:

```ts
import { TenantGuard, TenantRequired } from 'nestjs-boot/tenancy';

// Đăng ký toàn cục
app.useGlobalGuards(app.get(TenantGuard));

@Controller('products')
export class ProductController {
  @Get()
  @TenantRequired() // trả về 401 nếu không phân giải được tenant ID
  findAll() { ... }

  @Get('public-catalog')
  // Không có @TenantRequired — truy cập được mà không cần tenant header
  getPublicCatalog() { ... }
}
```

Decorator `@TenantScoped()` mang tính thông tin, báo hiệu rằng query của route được giới hạn theo tenant qua tầng repository.

## Thực hành tốt

- Bắt đầu với cách ly theo hàng. Nó đáp ứng hầu hết trường hợp SaaS với độ phức tạp tối thiểu. Chỉ chuyển sang cách ly theo schema hoặc database khi yêu cầu tuân thủ đòi hỏi.
- Luôn thêm index kết hợp với `tenantId` làm khóa đầu cho collection cách ly theo hàng: `{ tenantId: 1, status: 1, createdAt: -1 }`.
- Dùng `{ requireTenant: true }` trên repository ở các đường dẫn quan trọng (billing, dữ liệu người dùng) để fail-fast thay vì âm thầm trả về dữ liệu liên tenant.
- Cho background job, bọc xử lý trong `runWithTenant(tenantId, fn)` để thiết lập ngữ cảnh tenant ngoài HTTP middleware.
- Test cách ly tenant nghiêm ngặt. Một lỗi filter trong cách ly theo hàng có thể lộ dữ liệu liên tenant. Viết test tạo dữ liệu cho tenant A và assert tenant B không đọc được.
- Dùng `@TenantRequired()` trên tất cả route theo tenant và để các endpoint công khai (health check, landing page) không decorate.
