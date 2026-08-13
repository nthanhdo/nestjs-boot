# Xử lý lỗi

nestjs-boot cung cấp hệ thống xử lý lỗi phân tầng: exception có cấu trúc với mã lỗi ổn định, filter toàn cục, response envelope, chuyển đổi lỗi Mongoose, error boundary, và tùy chọn xuất theo chuẩn RFC 7807 Problem Details.

## BootException

`BootException` kế thừa `HttpException` với trường `code` ổn định mà client có thể dùng để phân nhánh xử lý, tách biệt khỏi message dành cho người đọc (có thể thay đổi giữa các phiên bản).

```ts
import { BootException } from '@nestjs-boot/common';

throw new BootException('Product not found', {
  code: 'PRODUCT_NOT_FOUND',
  status: 404,
});

throw new BootException('Insufficient stock', {
  code: 'INSUFFICIENT_STOCK',
  status: 409,
  details: [{ sku: 'ABC123', available: 2, requested: 5 }],
});
```

Các tùy chọn: `code` (string), `status` (number, mặc định 500), `details` (unknown[]).

## ErrorCodes Registry

Registry tập trung chứa các mã lỗi ổn định dành cho máy đọc. Đây là các hằng số string thuần (không phải enum) để serialize sang JSON sạch sẽ và không bị loại bỏ khi tree-shaking.

```ts
import { BootException, ErrorCodes } from '@nestjs-boot/common';

throw new BootException('Token has expired', {
  code: ErrorCodes.AUTH_TOKEN_EXPIRED,
  status: 401,
});
```

Các danh mục có sẵn: `AUTH_*` (token hết hạn/không hợp lệ/bị thu hồi, không đủ quyền, giới hạn tần suất), `DB_*` (kết nối thất bại, khóa trùng, validation thất bại, không tìm thấy), `TRANSPORT_*` (timeout, không khả dụng, circuit open), và các mã chung (`VALIDATION_FAILED`, `RATE_LIMITED`, `INTERNAL_ERROR`).

Bạn có thể thêm mã lỗi riêng bên cạnh các mã có sẵn. Kiểu union `ErrorCode` bao gồm tất cả giá trị đã đăng ký.

## AllExceptionsFilter

Filter bắt tất cả toàn cục, tạo response JSON có cấu trúc với timestamp, path, và mã lỗi ổn định (nếu có).

```ts
// app.module.ts
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from '@nestjs-boot/common';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

Cấu trúc response (`ErrorResponse`):

```json
{
  "statusCode": 404,
  "message": "Product not found",
  "error": "BootException",
  "code": "PRODUCT_NOT_FOUND",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "path": "/api/products/abc"
}
```

Filter xử lý được cả context HTTP, RPC, và WebSocket. Với RPC, nó ném lại exception để NestJS RpcExceptionFilter xử lý lỗi ở tầng transport. Các lỗi từ ValidationPipe (khi `message` là mảng) sẽ tự động được trích xuất vào trường `details`.

### Tích hợp Error Reporter

Kết nối hệ thống giám sát bên ngoài (Sentry, Datadog) mà không cần tạo lớp con:

```ts
import { ErrorReporter } from '@nestjs-boot/common';
import * as Sentry from '@sentry/node';

ErrorReporter.configure({
  onError: (error, ctx) => Sentry.captureException(error, { extra: ctx }),
  filter: (error) => !(error instanceof NotFoundException), // bỏ qua 404
  enrichContext: (ctx) => ({ ...ctx, environment: process.env.NODE_ENV }),
});
```

Reporter nhận đầy đủ `ErrorContext` bao gồm `statusCode`, `path`, `method`, `correlationId`, `traceId` (tự động trích xuất từ OpenTelemetry), và `contextType`. Lỗi phát sinh bên trong reporter sẽ bị nuốt để tránh lỗi lan truyền dây chuyền.

## ResponseInterceptor

Bọc các response thành công vào một envelope thống nhất. Kích hoạt qua `APP_INTERCEPTOR`:

```ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from '@nestjs-boot/common';

providers: [
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
]
```

Response thông thường sẽ thành `{ statusCode, message: "Success", data }`. Response phân trang (object có các trường `data`, `total`, `page`, `limit`) sẽ được trải các trường đó vào envelope. Response đã có envelope sẵn (object có trường `statusCode`) sẽ đi qua không thay đổi.

## MongooseErrorInterceptor

Bắt hai loại lỗi Mongoose phổ biến nhất và chuyển đổi thành BootException có cấu trúc.

**ValidationError** trở thành 422 với chi tiết từng trường:

```json
{
  "code": "DB_VALIDATION_FAILED",
  "statusCode": 422,
  "message": "Validation failed: email, name",
  "details": [
    { "field": "email", "message": "is required", "kind": "required" }
  ]
}
```

**MongoServerError 11000** (khóa trùng) trở thành 409 Conflict với trường vi phạm.

Hai cách sử dụng:

```ts
// Toàn cục — đăng ký như APP_INTERCEPTOR
{ provide: APP_INTERCEPTOR, useClass: MongooseErrorInterceptor }

// Từng service — xử lý có chọn lọc
import { transformMongooseError } from '@nestjs-boot/common';

async create(dto: CreateUserDto) {
  try {
    return await this.userModel.create(dto);
  } catch (err) {
    throw transformMongooseError(err) ?? err;
  }
}
```

## errorBoundary / errorBoundarySync

Bọc các thao tác với xử lý lỗi nhất quán. Bắt lỗi, bọc vào BootException với mã ổn định, và ném lại hoặc trả về giá trị dự phòng.

```ts
import { errorBoundary, errorBoundarySync } from '@nestjs-boot/common';

// Ném lại dưới dạng BootException (mặc định)
const order = await errorBoundary(
  () => this.orderService.create(data),
  { code: 'ORDER_CREATE_FAILED', status: 500 },
);

// Trả về null khi thất bại (không bao giờ ném)
const cached = await errorBoundary(
  () => this.cache.get(key),
  { code: 'CACHE_MISS', fallback: null },
);

// Biến thể đồng bộ
const parsed = errorBoundarySync(
  () => JSON.parse(rawInput),
  { code: 'PARSE_FAILED', status: 400, fallback: null },
);
```

Các tùy chọn: `code` (bắt buộc), `status` (mặc định 500), `fallback` (trả về thay vì ném), `rethrow` (mặc định true trừ khi có fallback), `wrap` (predicate: trả về false để cho lỗi gốc đi qua). Các BootException đã có code sẽ được giữ nguyên thay vì bọc hai lần.

## RFC 7807 Problem Details

Định dạng lỗi tuân thủ RFC 7807/9457, kích hoạt qua `toProblemDetails()`:

```ts
import { toProblemDetails } from '@nestjs-boot/common';

const pd = toProblemDetails(exception, '/api/orders/123');
// {
//   type: 'about:blank#ORDER_NOT_FOUND',
//   title: 'Not Found',
//   status: 404,
//   detail: 'Order not found',
//   instance: '/api/orders/123',
//   code: 'ORDER_NOT_FOUND',
// }
```

Khi có mã lỗi ổn định, nó sẽ được thêm dưới dạng URI fragment vào trường `type`. Ghi đè `baseUri` để trỏ đến trang tài liệu lỗi của bạn: `toProblemDetails(err, path, 'https://docs.myapp.com/errors')`.

Hàm này chấp nhận `BootException`, `HttpException`, hoặc cấu trúc `ErrorResponse` đã serialize từ filter.

## Thực hành tốt

- Định nghĩa mã lỗi theo domain dưới dạng hằng số cùng với `ErrorCodes` thay vì dùng chuỗi thô
- Dùng `errorBoundary` tại ranh giới service (API bên ngoài, cache, file I/O) để chuẩn hóa lỗi
- Đăng ký `MongooseErrorInterceptor` toàn cục để có response lỗi database nhất quán
- Kết nối `ErrorReporter` trong `main.ts` trước khi app bắt đầu lắng nghe
- Dùng trường `code` (không phải `message`) cho logic xử lý lỗi phía client
- Giữ `AllExceptionsFilter` làm filter ngoài cùng; đặt các interceptor bên trong nó
