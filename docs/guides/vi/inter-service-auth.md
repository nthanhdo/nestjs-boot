# Xác thực liên service — nestjs-boot

> Tự động truyền JWT token và API key qua ranh giới microservice.

---

## Tổng quan

Khi Service A gọi Service B, ngữ cảnh auth của người gọi (JWT hoặc API key) nên được truyền để Service B có thể thực thi cùng quyền. `InterServiceAuthModule` xử lý việc này một cách minh bạch sử dụng `AsyncLocalStorage`.

**Luồng:** Request đến -> `AuthPropagationInterceptor` trích xuất thông tin xác thực -> lưu vào `AsyncLocalStorage` -> lời gọi đi đọc ngữ cảnh qua `buildAuthHeaders` hoặc `injectAuthIntoPayload`.

---

## Cài đặt

```ts
import { InterServiceAuthModule } from 'nestjs-boot';

@Module({
  imports: [
    InterServiceAuthModule.register({
      propagation: 'jwt',              // 'jwt' | 'api-key' | 'both'
      serviceToken: process.env.SERVICE_TOKEN,  // fallback khi không có ngữ cảnh user
      headerName: 'Authorization',     // mặc định
      apiKeyHeaderName: 'x-api-key',   // mặc định
    }),
  ],
})
export class AppModule {}
```

Module được đăng ký global. `AuthPropagationInterceptor` được áp dụng làm global interceptor tự động.

### Tùy chọn

| Tùy chọn | Kiểu | Mặc định | Mô tả |
|--------|------|---------|-------------|
| `propagation` | `'jwt' \| 'api-key' \| 'both'` | bắt buộc | Thông tin xác thực nào cần trích xuất và truyền |
| `serviceToken` | `string` | `undefined` | Token tĩnh service-to-service dùng khi không có ngữ cảnh user |
| `headerName` | `string` | `'Authorization'` | Tên header để trích xuất JWT |
| `apiKeyHeaderName` | `string` | `'x-api-key'` | Tên header để trích xuất API key |

---

## AuthPropagationInterceptor

Được áp dụng global khi đăng ký. Với mỗi request đến, nó:

1. Trích xuất JWT từ header `Authorization: Bearer <token>` (nếu `propagation` là `'jwt'` hoặc `'both'`)
2. Trích xuất API key từ header `x-api-key` (nếu `propagation` là `'api-key'` hoặc `'both'`)
3. Fallback về `serviceToken` khi không có cái nào
4. Lưu ngữ cảnh trong `AsyncLocalStorage` suốt thời gian request

Hoạt động cho cả ngữ cảnh HTTP và RPC.

---

## API Auth Context

### getAuthContext

Đọc ngữ cảnh auth hiện tại (có sẵn bên trong bất kỳ request handler hoặc lời gọi service nào trong cùng chuỗi async).

```ts
import { getAuthContext } from 'nestjs-boot';

const ctx = getAuthContext();
// ctx?.token    — chuỗi JWT (không có prefix 'Bearer ')
// ctx?.apiKey   — chuỗi API key
// ctx?.metadata — cặp key-value tùy ý
```

Trả về `undefined` nếu được gọi ngoài ngữ cảnh request.

### setAuthContext

Sửa đổi ngữ cảnh auth hiện tại trong callback `runWithAuthContext`.

```ts
import { setAuthContext } from 'nestjs-boot';

setAuthContext({
  metadata: { 'x-trace-id': traceId },
});
```

Chỉ hoạt động trong ngữ cảnh đang hoạt động. Merge metadata thay vì thay thế.

### runWithAuthContext

Chạy hàm trong ngữ cảnh auth rõ ràng. Hữu ích cho background job hoặc test.

```ts
import { runWithAuthContext } from 'nestjs-boot';

await runWithAuthContext(
  { token: serviceJwt, metadata: { 'x-source': 'cron-job' } },
  async () => {
    // Tất cả lời gọi bên trong đây thấy ngữ cảnh auth này
    await orderService.processExpiredOrders();
  },
);
```

---

## Lời gọi đi

### buildAuthHeaders — Transport HTTP

Đọc ngữ cảnh `AsyncLocalStorage` hiện tại và tạo header cho request HTTP đi.

```ts
import { buildAuthHeaders } from 'nestjs-boot';

// Trong HttpService interceptor hoặc client tùy chỉnh:
const headers = buildAuthHeaders();
// { 'Authorization': 'Bearer eyJ...', 'x-api-key': 'abc123', ...metadata }

await httpService.get('http://user-service/users/123', { headers });
```

Fallback về `serviceToken` khi không có ngữ cảnh:

```ts
const headers = buildAuthHeaders({ serviceToken: process.env.SERVICE_TOKEN });
```

### injectAuthIntoPayload — Transport không phải HTTP

Cho TCP, NATS, RabbitMQ, và các transport dựa trên message khác, inject field `__auth` vào message payload.

```ts
import { injectAuthIntoPayload } from 'nestjs-boot';

const payload = injectAuthIntoPayload(
  { userId: '123', action: 'debit' },
  { serviceToken: process.env.SERVICE_TOKEN },
);
// {
//   userId: '123',
//   action: 'debit',
//   __auth: { token: 'eyJ...', apiKey: 'abc', metadata: { ... } }
// }

client.emit('payment.process', payload);
```

Service nhận có thể trích xuất `__auth` và gọi `runWithAuthContext` để khôi phục ngữ cảnh.

---

## Ví dụ: Chuỗi truyền đầy đủ

```ts
// gateway-service/app.module.ts
InterServiceAuthModule.register({
  propagation: 'both',
  serviceToken: process.env.INTER_SERVICE_TOKEN,
})

// gateway-service/order.controller.ts
@Get('orders/:id')
async getOrder(@Param('id') id: string) {
  // Ngữ cảnh auth được interceptor tự động bắt lấy
  const headers = buildAuthHeaders();
  const order = await this.httpService.get(
    `http://order-service/orders/${id}`,
    { headers },
  );
  return order.data;
}

// order-service — nhận cùng JWT, thực thi cùng quyền
```
