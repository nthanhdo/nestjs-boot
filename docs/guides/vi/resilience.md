# Khả năng phục hồi (Resilience)

nestjs-boot cung cấp ba mẫu resilience dưới dạng decorator: circuit breaker, retry với backoff, và timeout. Chúng có thể kết hợp trên cùng một phương thức để tạo khả năng chịu lỗi phân tầng.

## Circuit Breaker

Ngăn lỗi lan truyền dây chuyền bằng cách theo dõi lỗi liên tiếp và tạm thời chặn lời gọi đến dependency đang lỗi.

### Các trạng thái

- **CLOSED** (bình thường): request đi qua bình thường. Lỗi tăng bộ đếm.
- **OPEN** (đã kích hoạt): tất cả request ngay lập tức ném `CircuitBreakerOpenError`. Sau `resetTimeout` ms, chuyển sang HALF_OPEN.
- **HALF_OPEN** (thăm dò): cho phép `halfOpenMax` request đi qua. Nếu một request thành công, chuyển về CLOSED. Nếu thất bại, chuyển lại OPEN.

### Sử dụng như Decorator

```ts
import { CircuitBreakerDecorator } from 'nestjs-boot/resilience';

@Injectable()
export class PaymentGateway {
  @CircuitBreakerDecorator({
    failureThreshold: 5,   // mở sau 5 lỗi liên tiếp
    resetTimeout: 30_000,  // thử lại sau 30s
    halfOpenMax: 1,        // cho phép 1 request thăm dò
  })
  async charge(amount: number): Promise<Receipt> {
    return this.httpClient.post('/charge', { amount });
  }
}
```

Mỗi phương thức được decorate có instance `CircuitBreaker` riêng. Instance có thể truy cập để test qua `method.__circuitBreaker`.

### Sử dụng như Class

Cho kiểm soát lập trình (ví dụ bọc SDK bên thứ ba):

```ts
import { CircuitBreaker, CircuitBreakerOpenError } from 'nestjs-boot/resilience';

const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 10_000 });

try {
  const result = await breaker.execute(() => externalApi.call());
} catch (err) {
  if (err instanceof CircuitBreakerOpenError) {
    // Circuit đang mở — trả về dữ liệu cache/dự phòng
    return fallbackData;
  }
  throw err;
}

// Kiểm tra và reset
console.log(breaker.getState()); // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
breaker.reset(); // ép về CLOSED
```

### Cấu hình

| Tùy chọn | Kiểu | Mặc định | Mô tả |
|--------|------|---------|-------------|
| `failureThreshold` | `number` | `5` | Số lỗi trước khi mở |
| `resetTimeout` | `number` | `30000` | Ms trước khi OPEN chuyển sang HALF_OPEN |
| `halfOpenMax` | `number` | `1` | Số request thăm dò cho phép trong HALF_OPEN |

## Retry

Thử lại lời gọi bất đồng bộ thất bại với chiến lược backoff tùy chỉnh và bộ lọc lỗi tùy chọn.

```ts
import { Retry } from 'nestjs-boot/resilience';

@Injectable()
export class InventoryService {
  @Retry({
    maxAttempts: 3,
    backoff: 'exponential',  // hoặc 'fixed'
    delay: 1000,             // delay cơ sở tính bằng ms
    maxDelay: 10_000,        // giới hạn cho tăng trưởng hàm mũ
  })
  async checkStock(sku: string): Promise<number> {
    return this.warehouseApi.getStock(sku);
  }
}
```

### Retry có chọn lọc

Dùng `retryOn` để chỉ thử lại các lỗi cụ thể:

```ts
@Retry({
  maxAttempts: 4,
  backoff: 'exponential',
  delay: 500,
  retryOn: (error) => {
    // Chỉ thử lại lỗi mạng/timeout, không phải 4xx
    return error.message.includes('ECONNREFUSED')
        || error.message.includes('timeout');
  },
})
async fetchPrice(id: string): Promise<Price> {
  return this.pricingApi.get(id);
}
```

Nếu `retryOn` trả về `false`, lỗi được ném ngay lập tức mà không thử lại thêm.

### Hành vi Backoff

- **fixed**: chờ `min(delay, maxDelay)` giữa mỗi lần thử.
- **exponential**: chờ `min(delay * 2^attempt + jitter, maxDelay)`. Jitter là `random(0, delay/2)` để tránh hiệu ứng thundering herd.

### Cấu hình

| Tùy chọn | Kiểu | Mặc định | Mô tả |
|--------|------|---------|-------------|
| `maxAttempts` | `number` | `3` | Tổng số lần thử bao gồm lần gọi đầu |
| `backoff` | `'fixed' \| 'exponential'` | `'exponential'` | Chiến lược backoff |
| `delay` | `number` | `1000` | Delay cơ sở tính bằng ms |
| `maxDelay` | `number` | `10000` | Giới hạn delay tối đa tính bằng ms |
| `retryOn` | `(error: Error) => boolean` | luôn thử lại | Predicate lọc lỗi có thể thử lại |

## Timeout

Đặt timeout cho từng route hoặc toàn cục. Sử dụng toán tử `timeout` của RxJS với NestJS interceptor.

### Cài đặt toàn cục

```ts
import { TimeoutInterceptor, RESILIENCE_OPTIONS } from 'nestjs-boot/resilience';

@Module({
  providers: [
    {
      provide: RESILIENCE_OPTIONS,
      useValue: { timeout: { default: 15_000 } }, // mặc định toàn cục 15s
    },
  ],
})
export class AppModule {}

// Đăng ký toàn cục
app.useGlobalInterceptors(app.get(TimeoutInterceptor));
```

### Ghi đè từng Route

```ts
import { Timeout } from 'nestjs-boot/resilience';

@Controller('reports')
export class ReportsController {
  @Get('monthly')
  @Timeout(60_000) // 60s cho endpoint chậm này
  generateMonthlyReport() { ... }

  @Get('summary')
  @Timeout(5_000) // 5s cho endpoint nhanh này
  getSummary() { ... }
}
```

Khi timeout kích hoạt, interceptor ném `RequestTimeoutException` (HTTP 408) với thông báo `Request timed out after Xms`.

Timeout mặc định là 30.000ms nếu không cung cấp `RESILIENCE_OPTIONS`.

## Kết hợp các mẫu

Xếp chồng decorator trên cùng một phương thức. Decorator ngoài cùng thực thi trước:

```ts
@Injectable()
export class ExternalApiService {
  @Retry({ maxAttempts: 3, delay: 500 })
  @CircuitBreakerDecorator({ failureThreshold: 5, resetTimeout: 30_000 })
  async fetchData(id: string): Promise<Data> {
    return this.httpClient.get(`/data/${id}`);
  }
}
```

Thứ tự thực thi: Retry bọc CircuitBreaker bọc lời gọi thực tế.

- Nếu circuit đang OPEN, `CircuitBreakerOpenError` được ném. Retry bắt và thử lại (circuit có thể chuyển sang HALF_OPEN trong thời gian delay retry).
- Nếu lời gọi thất bại vì lý do khác, circuit breaker ghi nhận lỗi, và retry xử lý backoff.

Với timeout + retry, dùng decorator `@Timeout` trên route controller (tầng interceptor) và `@Retry` trên phương thức service:

```ts
// Controller — timeout toàn bộ request
@Get(':id')
@Timeout(10_000)
getData(@Param('id') id: string) {
  return this.service.fetchData(id);
}

// Service — retry từng lời gọi
@Retry({ maxAttempts: 3 })
@CircuitBreakerDecorator({ failureThreshold: 5 })
async fetchData(id: string) { ... }
```

## Thực hành tốt

- Đặt `failureThreshold` dựa trên tỷ lệ lỗi dự kiến của dependency. Quá thấp gây kích hoạt giả; quá cao làm chậm phát hiện.
- Dùng exponential backoff cho API bên ngoài để tránh gây quá tải service đang phục hồi.
- Luôn cung cấp predicate `retryOn` cho lời gọi HTTP. Thử lại 400 Bad Request chỉ lãng phí thời gian và tài nguyên.
- Kết hợp circuit breaker + retry cho dependency bên ngoài, timeout cho SLA cấp request.
- Giám sát chuyển đổi trạng thái circuit breaker trong log (class ghi log `CLOSED -> OPEN` v.v. qua NestJS Logger).

## Observability cho Circuit Breaker

Khi `prom-client` được cài đặt, circuit breaker tự động cung cấp ba metric Prometheus:

### Các metric

| Metric | Kiểu | Label | Mô tả |
|--------|------|-------|-------|
| `boot_circuit_breaker_state` | Gauge | `name`, `state` | Trạng thái hiện tại (0=closed, 1=open, 2=half_open) |
| `boot_circuit_breaker_transitions_total` | Counter | `name`, `from`, `to` | Số lần chuyển đổi trạng thái |
| `boot_circuit_breaker_failures_total` | Counter | `name` | Tổng số lỗi |

Metric được đăng ký trên registry toàn cục của `prom-client` và tồn tại qua nhiều lần khởi tạo. Nếu `prom-client` chưa cài đặt, tất cả thao tác metric là no-op.

### CircuitBreakerStateChangeEvent

Khi có `EventBus`, mỗi lần chuyển đổi trạng thái phát ra một `CircuitBreakerStateChangeEvent`:

```ts
import { CircuitBreakerStateChangeEvent } from 'nestjs-boot/resilience';

export class CircuitBreakerStateChangeEvent {
  breakerName: string;          // định danh breaker
  previousState: CircuitBreakerState;  // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  newState: CircuitBreakerState;
  failureCount: number;         // số lỗi hiện tại
}
```

Event kế thừa `BootEvent` và được phát fire-and-forget (không chặn breaker).

### Xử lý thay đổi trạng thái

Dùng `@OnEvent` để xử lý chuyển đổi trạng thái breaker:

```ts
import { OnEvent } from '@nestjs/event-emitter';
import { CircuitBreakerStateChangeEvent } from 'nestjs-boot/resilience';

@Injectable()
export class BreakerAlertHandler {
  constructor(private readonly alerts: AlertService) {}

  @OnEvent(CircuitBreakerStateChangeEvent)
  async handleBreakerChange(event: CircuitBreakerStateChangeEvent) {
    if (event.newState === 'OPEN') {
      await this.alerts.sendAlert({
        severity: 'critical',
        title: `Circuit breaker "${event.breakerName}" đã mở`,
        message: `Breaker kích hoạt sau ${event.failureCount} lỗi`,
        timestamp: new Date(),
      });
    }

    if (event.newState === 'CLOSED' && event.previousState === 'HALF_OPEN') {
      await this.alerts.sendAlert({
        severity: 'info',
        title: `Circuit breaker "${event.breakerName}" đã phục hồi`,
        message: 'Breaker đóng — service đã healthy trở lại',
        timestamp: new Date(),
      });
    }
  }
}
```

### Dashboard Grafana

Ví dụ PromQL query cho dashboard circuit breaker:

```promql
# Trạng thái hiện tại mỗi breaker (dùng value mapping: 0=Closed, 1=Open, 2=Half-Open)
boot_circuit_breaker_state{state="OPEN"}

# Tỷ lệ chuyển đổi (mỗi 5 phút)
rate(boot_circuit_breaker_transitions_total[5m])

# Tỷ lệ lỗi mỗi breaker
rate(boot_circuit_breaker_failures_total[5m])

# Cảnh báo: breaker mở hơn 2 phút
boot_circuit_breaker_state{state="OPEN"} == 1
# for: 2m
# severity: critical
```

## Xem thêm

- [Alerts](alerts.md) — kết nối thay đổi trạng thái breaker với thông báo Slack/PagerDuty
- [Transport & Microservices](transport-microservices.md) — `ResilientServiceClient` bọc các mẫu này cho lời gọi liên service
- [Transport Selection Guide](transport-selection.md) — khi nào thêm resilience theo loại transport
- [Error Handling](error-handling.md) — `CircuitBreakerOpenError` và mẫu error boundary
