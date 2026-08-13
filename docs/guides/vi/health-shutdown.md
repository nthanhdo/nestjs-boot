# Health Check và Graceful Shutdown

nestjs-boot cung cấp health check tự động phát hiện hạ tầng và hệ thống graceful shutdown có thứ tự, thiết kế cho rolling deployment trên Kubernetes.

## HealthModule

`HealthModule` tự động phát hiện hạ tầng đã cấu hình và đăng ký các health indicator phù hợp. Xây dựng trên `@nestjs/terminus`.

```ts
import { BootModule } from '@nestjs-boot/core';

BootModule.register({
  database: { uri: 'mongodb://localhost/myapp' },
  cache: { redis: { url: 'redis://localhost:6379' } },
  health: { path: '/health' },  // mặc định: '/health'
});
```

Module kiểm tra `BootOptions` của bạn:
- Có `options.database`: đăng ký `DatabaseHealthIndicator` (ping MongoDB)
- Có `options.cache.redis`: đăng ký `RedisHealthIndicator` (ping Redis qua `MultiCacheService` đã inject)
- Không cấu hình gì: endpoint vẫn hoạt động, chỉ là không báo cáo indicator nào

Đường dẫn health controller có thể tùy chỉnh qua `options.health.path`.

## Hành vi của Health Endpoint

`GET /health` chạy tất cả indicator đã đăng ký qua Terminus `HealthCheckService`:

```json
{
  "status": "ok",
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

Trong quá trình graceful shutdown, endpoint trả về **503 Service Unavailable** ngay lập tức. Đây là chủ đích: nó khiến readiness probe của Kubernetes thất bại để pod bị loại khỏi service endpoint trước khi các kết nối đang xử lý được drain.

## ShutdownModule

Đăng ký hệ thống graceful shutdown. Thêm vào imports của module:

```ts
import { ShutdownModule } from '@nestjs-boot/shutdown';

ShutdownModule.register({
  timeout: 25000,           // thời gian chờ tối đa trước khi thoát cưỡng bức (mặc định: 30000)
  signals: ['SIGTERM', 'SIGINT'],  // mặc định
  drainStrategy: 'drain',  // 'drain' | 'immediate' (mặc định: 'drain')
  beforeShutdown: async () => {
    console.log('Flushing buffers...');
  },
})
```

Module được đăng ký toàn cục, nên `ShutdownService` và `InFlightTracker` khả dụng trong toàn ứng dụng.

## Trình tự Shutdown

Khi nhận được tín hiệu, `ShutdownService` điều phối quá trình tắt có thứ tự:

1. **Nhận tín hiệu** -- `SignalHandler` bắt SIGTERM/SIGINT, đặt cờ đang tắt. Các tín hiệu trùng lặp bị bỏ qua.
2. **Health endpoint trả về 503** -- Readiness probe K8s thất bại, pod bị loại khỏi load balancer.
3. **Giai đoạn 1: hook beforeShutdown** -- Logic dọn dẹp tùy chỉnh chạy (flush queue, đóng kết nối). Lỗi được bắt và ghi log nhưng không hủy quá trình shutdown.
4. **Giai đoạn 2: Đóng HTTP server** -- Ngừng nhận kết nối mới. Nếu `drainStrategy: 'drain'` và còn request đang xử lý, chờ chúng hoàn thành. Kết nối keep-alive được drain qua `closeAllConnections()` (Node 18.2+).
5. **Thoát cưỡng bức** -- Nếu shutdown vượt quá `timeout`, `process.exit(1)` được gọi.

## InFlightTracker

Theo dõi số lượng HTTP request đang xử lý. Được hệ thống shutdown sử dụng để quyết định khi nào việc drain hoàn tất.

```ts
import { InFlightTracker } from '@nestjs-boot/shutdown';

@Injectable()
export class RequestTrackingInterceptor implements NestInterceptor {
  constructor(private readonly tracker: InFlightTracker) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    this.tracker.increment();
    return next.handle().pipe(
      finalize(() => this.tracker.decrement()),
    );
  }
}
```

Bộ đếm không bao giờ xuống dưới 0. Truy cập số đếm hiện tại qua `tracker.getCount()`.

## SignalHandler

Đăng ký handler cho tín hiệu hệ điều hành và đảm bảo chỉ thực thi một lần (các tín hiệu trùng lặp trong quá trình shutdown bị bỏ qua). Cấu hình timer thoát cưỡng bức qua `setTimeout` với `unref()` để không giữ event loop sống.

## DrainStrategy

| Chiến lược | Hành vi |
|----------|----------|
| `'drain'` (mặc định) | Chờ request đang xử lý hoàn thành trước khi đóng HTTP server. Triển khai không downtime. |
| `'immediate'` | Đóng server ngay lập tức, bỏ request đang xử lý. Nhanh hơn nhưng mất dữ liệu. |

## Tích hợp Kubernetes

Hệ thống shutdown tự động phát hiện Kubernetes bằng cách kiểm tra `KUBERNETES_SERVICE_HOST` trong biến môi trường. Khi phát hiện, nó ghi log cấu hình preStop delay.

Cấu hình `deployment.yaml` khuyến nghị:

```yaml
spec:
  terminationGracePeriodSeconds: 35
  containers:
    - lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]
      readinessProbe:
        httpGet:
          path: /health
          port: 3000
        periodSeconds: 5
        failureThreshold: 1
```

Cấu hình nestjs-boot tương ứng:

```ts
ShutdownModule.register({
  timeout: 25000,        // buffer 5s trước khi K8s SIGKILL tại 35s
  drainStrategy: 'drain',
})
```

Dòng thời gian: K8s gọi preStop (sleep 5s) cho iptables thời gian cập nhật, sau đó gửi SIGTERM. Ứng dụng có 25s để drain, với buffer 5s trước khi `terminationGracePeriodSeconds` 35s kích hoạt SIGKILL.

Cấu hình preStop delay qua biến môi trường `BOOT_PRESTOP_DELAY_MS` (mặc định: 5000).

## Thực hành tốt

- Luôn dùng `drainStrategy: 'drain'` trong production để triển khai không downtime
- Đặt `timeout` bằng `terminationGracePeriodSeconds - preStopDelay - 5s` (buffer)
- Đăng ký `InFlightTracker` trong interceptor toàn cục để số đếm drain chính xác
- Dùng hook `beforeShutdown` để flush buffer ghi, đóng kết nối WebSocket, hoặc hủy đăng ký khỏi service discovery
- Test shutdown cục bộ: `kill -TERM <pid>` và xác nhận log hiển thị trình tự các giai đoạn
