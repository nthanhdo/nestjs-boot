# API Versioning

`VersioningModule` hỗ trợ versioning API theo URI, header, hoặc media-type với response header tự động và theo dõi deprecation.

## Cài đặt

```ts
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  versioning: { type: 'uri', defaultVersion: '1' },
});
```

Hoặc đăng ký module trực tiếp:

```ts
import { VersioningModule } from 'nestjs-boot/versioning';

@Module({
  imports: [VersioningModule.register({ type: 'header', header: 'X-API-Version' })],
})
export class AppModule {}
```

## Các chiến lược Versioning

| Chiến lược | Client gửi | Ví dụ route |
|----------|-------------|---------------|
| `uri` (mặc định) | `GET /v2/products` | Prefix đường dẫn `/v{N}` |
| `header` | `X-API-Version: 2` | Bất kỳ đường dẫn nào |
| `media-type` | `Accept: application/json;version=2` | Bất kỳ đường dẫn nào |

## Decorator @ApiVersion

Alias cho `@Version()` của NestJS với cách đặt tên nhất quán:

```ts
@Controller('products')
@ApiVersion('2')
export class ProductsV2Controller {
  @Get()
  findAll() { return []; }

  @Get(':id')
  @ApiVersion(['2', '3']) // nhiều version
  findOne(@Param('id') id: string) { return { id }; }
}
```

## Decorator @DeprecatedVersion

Đánh dấu endpoint là deprecated. `VersionInterceptor` tự động thêm header `Sunset` và `Deprecation: true`:

```ts
@Controller('products')
@ApiVersion('1')
@DeprecatedVersion('2026-12-31')
export class ProductsV1Controller {
  @Get()
  findAll() { return []; }
}
```

Response header cho endpoint deprecated:

```
X-API-Version: 1
Sunset: 2026-12-31
Deprecation: true
```

Một cảnh báo cũng được log: `Deprecated API endpoint called: ProductsV1Controller.findAll — sunset on 2026-12-31`.

## VersionInterceptor

Được đăng ký global bởi `VersioningModule`. Với mỗi HTTP response, nó:

1. Xác định version hiện tại từ request (prefix đường dẫn, header, hoặc accept header tùy chiến lược).
2. Đặt response header `X-API-Version`.
3. Kiểm tra metadata `@DeprecatedVersion` và thêm header `Sunset`/`Deprecation` nếu có.

## Tham chiếu cấu hình

```ts
interface VersioningOptions {
  type?: 'uri' | 'header' | 'media-type'; // mặc định: 'uri'
  defaultVersion?: string;                 // mặc định: '1'
  header?: string;                         // mặc định: 'X-API-Version'
  mediaTypeKey?: string;                   // mặc định: 'version'
}
```

## Thực hành tốt nhất

- Bắt đầu với URI versioning cho đơn giản; chuyển sang header versioning khi bạn cần URL không phụ thuộc version.
- Đặt ngày `Sunset` cụ thể khi deprecate một version để client có thể lên kế hoạch chuyển đổi.
- Giữ `defaultVersion` ở `'1'` và gắn decorator rõ ràng cho controller mới hơn với `@ApiVersion('2')`.
- Tránh hỗ trợ quá 2 version hoạt động cùng lúc để giảm chi phí bảo trì.
