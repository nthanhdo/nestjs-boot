# Swagger / OpenAPI

`setupSwagger()` tự động cấu hình Swagger UI với bảo mật Bearer/ApiKey, schema phân trang, và tài liệu error response. Tự động bỏ qua khi `@nestjs/swagger` chưa được cài đặt.

## Cài đặt

```ts
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  swagger: {
    path: '/api/docs',
    title: 'My API',
    description: 'Product catalog service',
    auth: true,
    tags: [{ name: 'products', description: 'Product operations' }],
  },
});
```

Swagger UI phục vụ tại `/api/docs` và JSON spec tại `/api/docs-json`. Bật mặc định trong môi trường development, tắt trong production (ghi đè với `enabled: true`).

## Tham chiếu cấu hình

```ts
interface SwaggerOptions {
  enabled?: boolean;               // mặc định: !production
  path?: string;                   // mặc định: '/api/docs'
  title?: string;                  // mặc định: tên package.json
  description?: string;
  version?: string;                // mặc định: version package.json
  servers?: Array<{ url: string; description?: string }>;
  auth?: boolean;                  // mặc định: true khi auth module được cấu hình
  tags?: Array<{ name: string; description?: string }>;
}
```

## Security Schemes

Khi `auth: true` (hoặc khi auth module được phát hiện), hai security scheme được thêm tự động:

- **Bearer** — `Authorization: Bearer <jwt>`
- **ApiKey** — `x-api-key: <key>` header

Không cần gọi `DocumentBuilder` thủ công.

## Decorator

### @ApiTag

Nhóm controller dưới một tag thanh bên Swagger:

```ts
@ApiTag('products')
@Controller('products')
export class ProductsController {}
```

### @ApiResponse

Tài liệu hóa response thành công với kiểu DTO:

```ts
@ApiResponse(201, CreateProductDto)
@Post()
create(@Body() dto: CreateProductDto) {}
```

### @ApiPaginated

Tài liệu hóa response phân trang với cấu trúc `{ data, total, page, limit, hasNext }`:

```ts
@ApiPaginated(ProductDto)
@Get()
findAll(@Query() query: PaginationDto) {}
```

### @ApiErrorResponses

Thêm schema lỗi chuẩn 400/401/403/404/500 trong một decorator:

```ts
@ApiErrorResponses()
@Get(':id')
findOne(@Param('id') id: string) {}
```

### @AutoApiProperties

Tự động tạo `@ApiProperty()` từ các class-validator decorator trên DTO, loại bỏ trùng lặp:

```ts
@AutoApiProperties()
export class CreateProductDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  price?: number;
}
```

Suy luận `type` từ `@IsString`, `@IsNumber`, `@IsBoolean`, `@IsArray` và đánh dấu field là optional khi có `@IsOptional`.

## Graceful Degradation

Tất cả decorator trả về no-op khi `@nestjs/swagger` chưa được cài đặt. Code ứng dụng của bạn biên dịch và chạy bình thường mà không cần package này; bạn chỉ cần nó để phục vụ UI.

`setupSwagger()` log cảnh báo và return sớm nếu package bị thiếu.

## Thực hành tốt nhất

- Giữ `enabled: false` trong production để tránh lộ cấu trúc API nội bộ.
- Sử dụng `@ApiTag` trên mọi controller để nhóm thanh bên gọn gàng.
- Kết hợp `@ApiPaginated` với `@ApiErrorResponses` trên endpoint danh sách để có tài liệu đầy đủ.
- Ưu tiên `@AutoApiProperties` thay vì `@ApiProperty` thủ công để giữ DTO DRY.
- Thêm `servers` cho URL staging/production để tester có thể chuyển môi trường trong UI.
