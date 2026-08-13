# Thanh toán & Webhook

`WebhookModule` xử lý xác minh chữ ký webhook thanh toán, chuẩn hóa sự kiện, và xử lý request idempotent cho Stripe, PayPal, và các provider tùy chỉnh.

## Cài đặt

```ts
import { WebhookModule } from 'nestjs-boot/payments';

@Module({
  imports: [
    WebhookModule.register({
      providers: {
        stripe: { secret: process.env.STRIPE_WEBHOOK_SECRET },
        paypal: { secret: process.env.PAYPAL_WEBHOOK_SECRET },
      },
      handler: async (event) => {
        if (event.type === 'payment_intent.succeeded') {
          await ordersService.fulfill(event.data);
        }
      },
    }),
  ],
})
export class AppModule {}
```

NestJS phải được cấu hình với `rawBody: true` để raw Buffer có sẵn cho xác minh chữ ký:

```ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

## Webhook Endpoint

Module đăng ký endpoint động `POST /webhooks/:provider`. Request được định tuyến theo tên provider:

- `POST /webhooks/stripe` — Sự kiện Stripe
- `POST /webhooks/paypal` — Sự kiện PayPal
- `POST /webhooks/{custom}` — Provider tùy chỉnh bất kỳ

## Xác minh chữ ký

### Stripe

Stripe gửi header `stripe-signature` với format `t=<timestamp>,v1=<hmac>`. `StripeWebhookProvider` tích hợp sẵn tính lại HMAC-SHA256 trên `${timestamp}.${rawBody}` và so sánh bằng timing-safe equality.

### PayPal

PayPal sử dụng xác minh RSA dựa trên chứng chỉ trong production. Provider tích hợp sẵn bao gồm HMAC fallback đơn giản hóa và log cảnh báo. Cho production, cung cấp `verifyFn` tùy chỉnh:

```ts
paypal: {
  secret: process.env.PAYPAL_WEBHOOK_SECRET,
  verifyFn: (payload, signature, secret) => {
    // Sử dụng @paypal/paypal-server-sdk hoặc PayPal REST API
    return verifyPayPalSignature(payload, signature, secret);
  },
},
```

## Provider tùy chỉnh

Implement `WebhookProvider` để thêm bất kỳ bộ xử lý thanh toán nào:

```ts
import { WebhookProvider, WebhookEvent } from 'nestjs-boot/payments';

export class LemonSqueezyProvider implements WebhookProvider {
  name = 'lemonsqueezy';

  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    const hmac = createHmac('sha256', secret).update(payload).digest('hex');
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  }

  normalizeEvent(rawPayload: unknown): WebhookEvent {
    const raw = rawPayload as Record<string, unknown>;
    return {
      provider: 'custom',
      type: raw['event_name'] as string,
      id: raw['meta']?.['event_id'] as string,
      data: raw['data'] as Record<string, unknown>,
      timestamp: new Date(),
      raw,
    };
  }
}
```

Đăng ký:

```ts
WebhookModule.register({
  providers: { lemonsqueezy: { secret: process.env.LS_WEBHOOK_SECRET } },
  customProviders: [new LemonSqueezyProvider()],
  handler: async (event) => { /* ... */ },
});
```

## Chuẩn hóa sự kiện

Tất cả provider chuẩn hóa sự kiện thành cấu trúc `WebhookEvent` thống nhất:

```ts
interface WebhookEvent {
  provider: 'stripe' | 'paypal' | 'custom';
  type: string;       // ví dụ: 'payment_intent.succeeded'
  id: string;         // ID sự kiện từ provider (dùng để loại trùng)
  data: Record<string, unknown>;
  timestamp: Date;
  raw: unknown;       // payload gốc
}
```

## Loại trùng Webhook

Controller duy trì kho loại trùng in-memory theo khóa `event.id`. Sự kiện trùng lặp trong cửa sổ TTL 5 phút được bỏ qua. Kho giới hạn tối đa 10.000 mục với cơ chế thu hồi theo TTL rồi theo thứ tự cũ nhất.

## Decorator @Idempotent

Cho các endpoint riêng (không chỉ webhook), sử dụng `@Idempotent` để cache response theo header `Idempotency-Key`:

```ts
@Post('charge')
@Idempotent(3600) // cache 1 giờ
async charge(@Body() dto: ChargeDto) {
  return this.paymentsService.charge(dto);
}
```

Cách hoạt động:
1. Client gửi header `Idempotency-Key: <uuid>` với request POST/PUT/PATCH.
2. `IdempotencyGuard` kiểm tra cache in-memory cho key đó.
3. Cache hit (trong TTL) — trả về `{ statusCode, body }` đã cache ngay lập tức mà không gọi handler.
4. Cache miss — handler thực thi, response được cache cho các request tương lai với cùng key.

Guard chỉ kích hoạt trên các method thay đổi (POST, PUT, PATCH). Request GET/DELETE đi qua bình thường. Thiếu header `Idempotency-Key` cũng đi qua (tư vấn, không chặn).

## Chi tiết IdempotencyGuard

- **MAX_SIZE:** 10.000 mục. Thu hồi chạy trước mỗi lần chèn mới.
- **Thứ tự thu hồi:** mục hết hạn trước (theo TTL), rồi cũ nhất theo thứ tự chèn.
- **TTL mặc định:** 86.400 giây (24 giờ) khi không truyền tham số TTL cho `@Idempotent()`.

## Thực hành tốt nhất

- Luôn bật `rawBody: true` trong NestFactory — xác minh chữ ký yêu cầu body request chưa sửa đổi.
- Sử dụng tùy chọn `verifyFn` cho PayPal trong production; HMAC fallback tích hợp sẵn chỉ dành cho development.
- Đặt idempotency TTL khớp với cửa sổ retry của provider (Stripe retry tới 72 giờ).
- Trả về lỗi từ handler để cho phép retry — mục loại trùng bị xóa khi handler thất bại.
- Cho hệ thống thông lượng cao, thay thế kho loại trùng in-memory bằng Redis.
