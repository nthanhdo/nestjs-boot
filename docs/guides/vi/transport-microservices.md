# Transport và Microservice

Giao tiếp giữa các service với `TransportModule` (gRPC, TCP, NATS, RabbitMQ), service client có kiểu dữ liệu, các pattern resilience (timeout, retry, circuit breaker), service discovery, và truyền lỗi giữa các service.

## Thiết lập TransportModule

Đăng ký client proxy có tên cho các lời gọi ra và kết nối server transport cho thông điệp đến.

```ts
import { TransportModule } from 'nestjs-boot';

@Module({
  imports: [
    TransportModule.register({
      // Server transports (inbound)
      grpc: {
        url: '0.0.0.0:5000',
        package: 'order',
        protoPath: join(__dirname, 'proto/order.proto'),
      },
      tcp: { host: '0.0.0.0', port: 3001 },

      // Client proxies (outbound)
      clients: {
        ORDER_SERVICE: {
          transport: 'grpc',
          options: {
            url: 'order-service:5000',
            package: 'order',
            protoPath: join(__dirname, 'proto/order.proto'),
          },
        },
        NOTIFICATION_SERVICE: {
          transport: 'nats',
          options: { url: 'nats://localhost:4222', queue: 'notifications' },
        },
      },
    }),
  ],
})
export class AppModule {}
```

`TransportModule` là `@Global()`. Nó yêu cầu `@nestjs/microservices` làm peer dependency — nếu chưa cài, một cảnh báo được log và không có client nào được đăng ký (graceful degradation).

### Inject Client

Dùng `@InjectClient()` hoặc `@InjectGrpcClient()` để inject client proxy có tên:

```ts
import { InjectClient } from 'nestjs-boot';

@Injectable()
export class OrderService {
  constructor(@InjectClient('ORDER_SERVICE') private readonly orderClient: ClientProxy) {}
}
```

### connectTransports()

Cho ứng dụng hybrid phục vụ cả HTTP và microservice transport, gọi `connectTransports()` trong bootstrap:

```ts
import { connectTransports } from 'nestjs-boot';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await connectTransports(app, {
    grpc: { url: '0.0.0.0:5000', package: 'order', protoPath: '...' },
    tcp: { host: '0.0.0.0', port: 3001 },
  });

  await app.listen(3000);
  // HTTP on :3000, gRPC on :5000, TCP on :3001
}
```

Tùy chọn transport được validate khi khởi động — thiếu trường bắt buộc (ví dụ gRPC không có `url`, `package`, hoặc `protoPath`) sẽ throw lỗi mô tả rõ ràng ngay lập tức.

## ServiceClient\<T\> — Lời gọi có kiểu dữ liệu

Bọc `ClientProxy` bằng `ServiceClient<T>` để gọi giữa các service có kiểu an toàn với tự động truyền correlation ID và auth context.

```ts
import { ServiceClient } from 'nestjs-boot';

// Define the remote service interface
interface OrderService {
  createOrder(data: CreateOrderDto): OrderResponseDto;
  findOrder(data: { id: string }): OrderResponseDto;
}

@Injectable()
export class OrderGateway {
  private readonly client: ServiceClient<OrderService>;

  constructor(@InjectClient('ORDER_SERVICE') clientProxy: ClientProxy) {
    this.client = new ServiceClient<OrderService>(clientProxy);
  }

  async create(dto: CreateOrderDto): Promise<OrderResponseDto> {
    // Type-safe: method name and payload are checked at compile time
    return this.client.call('createOrder', dto);
  }

  notifyShipped(orderId: string): void {
    // Fire-and-forget event
    this.client.emit('orderShipped', { id: orderId });
  }
}
```

Cả `call()` và `emit()` đều tự động inject:
- **Correlation ID** từ `AsyncLocalStorage` (qua correlation module)
- **Auth context** (JWT token, API key) từ `AsyncLocalStorage` (qua inter-service-auth module)

## ResilientServiceClient — Timeout, Retry, Circuit Breaker

Bọc client proxy bằng `createResilientClient()` để thêm resilience cho mỗi lời gọi. Cả ba tính năng đều optional và có thể kết hợp.

```ts
import { createResilientClient, ResilientServiceClient } from 'nestjs-boot';

interface PaymentService {
  charge(data: ChargeDto): ChargeResult;
  refund(data: RefundDto): RefundResult;
}

@Injectable()
export class PaymentGateway {
  private readonly client: ResilientServiceClient<PaymentService>;

  constructor(@InjectClient('PAYMENT_SERVICE') proxy: ClientProxy) {
    this.client = createResilientClient<PaymentService>(proxy, {
      timeout: 5000,
      retry: {
        maxAttempts: 3,
        backoff: 'exponential', // or 'fixed'
        delay: 1000,            // base delay in ms
        maxDelay: 10000,        // cap for exponential backoff
        retryOn: (err) => !(err instanceof BusinessLogicError), // skip non-retryable
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 30000,
      },
    });
  }

  async charge(dto: ChargeDto): Promise<ChargeResult> {
    return this.client.call('charge', dto);
    // Execution order: circuit-breaker -> retry -> timeout -> send
  }

  getCircuitState(): string {
    return this.client.getCircuitState(); // 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'DISABLED'
  }
}
```

### Tùy chọn Resilience

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `timeout` | `number` | — | Timeout mỗi lời gọi tính bằng ms. Reject với lỗi timeout nếu vượt quá |
| `retry.maxAttempts` | `number` | `3` | Số lần retry tối đa |
| `retry.backoff` | `'exponential' \| 'fixed'` | `'exponential'` | Chiến lược backoff |
| `retry.delay` | `number` | `1000` | Độ trễ cơ bản tính bằng ms |
| `retry.maxDelay` | `number` | `10000` | Giới hạn độ trễ tối đa |
| `retry.retryOn` | `(err) => boolean` | — | Hàm lọc lỗi có thể retry |
| `circuitBreaker.failureThreshold` | `number` | — | Số lỗi liên tiếp trước khi mở circuit |
| `circuitBreaker.resetTimeout` | `number` | — | Thời gian tính bằng ms trước khi thử half-open |

## Service Discovery

`ServiceDiscoveryHook` là interface để phân giải URL động. Implement với Consul, Kubernetes DNS, biến môi trường, hoặc bất kỳ registry nào.

```ts
import { ServiceDiscoveryHook, fromResolverFn, staticUrl } from 'nestjs-boot';

// Environment variable resolution
class EnvDiscovery implements ServiceDiscoveryHook {
  constructor(private readonly envKey: string) {}
  async resolve(): Promise<{ url: string }> {
    const url = process.env[this.envKey];
    if (!url) throw new Error(`Missing env var: ${this.envKey}`);
    return { url };
  }
}

// Consul-based resolution
class ConsulDiscovery implements ServiceDiscoveryHook {
  constructor(private readonly consul: ConsulClient, private readonly svc: string) {}
  async resolve(): Promise<{ url: string }> {
    const address = await this.consul.resolve(this.svc);
    return { url: `http://${address}` };
  }
}

// One-liner with fromResolverFn()
const k8sDiscovery = fromResolverFn(async () => ({
  url: await dns.lookup('order-service.svc.cluster.local'),
}));

// Static URL (consistent config shape across environments)
const localDiscovery = staticUrl('grpc://localhost:5000');
```

Vòng đời phân giải:
1. **Khởi tạo module** — `resolve()` được gọi một lần cho mỗi client trước kết nối đầu tiên.
2. **Lỗi kết nối** — Nếu `retryOnFailure: true`, `resolve()` được gọi lại trước mỗi lần kết nối lại.

Nếu `resolve()` throw lúc khởi động, khởi tạo module sẽ thất bại ngay với lỗi mô tả rõ ràng.

## Ngữ cảnh lỗi giữa các Service

### ErrorContextInterceptor

Bảo toàn ngữ cảnh lỗi qua các RPC hop. Khi lời gọi downstream thất bại, interceptor làm giàu lỗi với tên service, correlation ID, và chuỗi gọi upstream.

```ts
import { ErrorContextInterceptor } from 'nestjs-boot';

// Global registration
const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(
  new ErrorContextInterceptor({ serviceName: 'api-gateway' }),
);
```

### BootRpcException

Lỗi RPC có cấu trúc với ngữ cảnh có thể truy vết:

```ts
import { BootRpcException } from 'nestjs-boot';

try {
  await orderClient.call('findOrder', { id: '123' });
} catch (err) {
  if (err instanceof BootRpcException) {
    console.log(err.code);                    // 'ORDER_NOT_FOUND'
    console.log(err.context.service);         // 'order-service'
    console.log(err.context.upstreamChain);   // ['api-gateway', 'order-service']
    console.log(err.context.correlationId);   // 'corr-abc-123'
  }
}
```

### BootRpcExceptionFilter

Exception filter chuẩn hóa cho microservice transport. Đăng ký toàn cục qua `RpcModule`:

```ts
import { RpcModule } from 'nestjs-boot';

@Module({
  imports: [RpcModule.register({ serviceName: 'order-service' })],
})
export class AppModule {}
```

Filter bắt mọi exception trong ngữ cảnh RPC và serialize thành envelope có cấu trúc khớp với format `AllExceptionsFilter` của HTTP. Nó có method static `toGrpcError()` để chuyển đổi sang lỗi gRPC native.

### Ánh xạ HTTP-gRPC Status Code

Ánh xạ hai chiều giữa HTTP và gRPC status code:

| HTTP | gRPC | Mô tả |
|------|------|-------------|
| 400 | `INVALID_ARGUMENT` (3) | Request không hợp lệ / lỗi validation |
| 401 | `UNAUTHENTICATED` (16) | Thiếu hoặc không hợp lệ thông tin xác thực |
| 403 | `PERMISSION_DENIED` (7) | Không đủ quyền |
| 404 | `NOT_FOUND` (5) | Không tìm thấy tài nguyên |
| 408 | `DEADLINE_EXCEEDED` (4) | Timeout request |
| 409 | `ALREADY_EXISTS` (6) | Xung đột |
| 429 | `RESOURCE_EXHAUSTED` (8) | Bị giới hạn tốc độ |
| 500 | `INTERNAL` (13) | Lỗi server nội bộ |
| 503 | `UNAVAILABLE` (14) | Service không khả dụng |

Dùng `httpStatusToGrpc()` và `grpcStatusToHttp()` cho chuyển đổi rõ ràng.

### deserializeRpcError / isRetryable

Tại API gateway hoặc service gọi, deserialize lỗi RPC ngược về `HttpException`:

```ts
import { deserializeRpcError, isRetryable } from 'nestjs-boot';

// In a client interceptor
catchError((err) => {
  if (isRetryable(err)) {
    // 408, 429, 503, 504 are retryable
    return retry({ count: 3, delay: 1000 })(source);
  }
  throw deserializeRpcError(err);
})
```

## Tùy chọn Transport Config

| Option | Type | Mô tả |
|--------|------|-------------|
| `grpc.url` | `string` | Địa chỉ bind gRPC (ví dụ `'0.0.0.0:5000'`) |
| `grpc.package` | `string \| string[]` | Tên proto package |
| `grpc.protoPath` | `string \| string[]` | Đường dẫn đến file `.proto` |
| `grpc.loader` | `object` | Tùy chọn proto loader (`keepCase`, `longs`, v.v.) |
| `grpc.credentials` | `unknown` | gRPC channel credentials (cho mTLS) |
| `tcp.host` | `string` | Host bind TCP (mặc định `'0.0.0.0'`) |
| `tcp.port` | `number` | Port bind TCP (mặc định `3001`) |
| `nats.url` | `string` | URL server NATS |
| `nats.queue` | `string` | Tên queue group |
| `rabbitmq.urls` | `string[]` | URL kết nối RabbitMQ |
| `rabbitmq.queue` | `string` | Tên queue |
| `rabbitmq.queueOptions` | `{ durable?: boolean }` | Tùy chọn queue |

## Best Practices

1. **Dùng `ResilientServiceClient` cho tất cả lời gọi giữa các service.** Timeout + retry + circuit breaker nên là mặc định, không phải thêm sau.
2. **Đăng ký `ErrorContextInterceptor` toàn cục** trên mọi service. Chuỗi upstream trong lỗi giúp debug lỗi phân tán dễ dàng hơn.
3. **Đăng ký `RpcModule`** trên mọi microservice để chuẩn hóa envelope lỗi giữa các transport.
4. **Dùng `ServiceClient<T>`** cho type safety. Định nghĩa remote interface một lần, chia sẻ giữa các service.
5. **Giữ timeout chặt** (2-5s cho lời gọi đồng bộ). Service downstream chậm không nên lan truyền.
6. **Dùng `isRetryable()`** để tránh retry lỗi client (400, 403, 404) — chỉ retry lỗi tạm thời.
7. **Service discovery** giữ cấu hình transport không phụ thuộc môi trường. Dùng `fromResolverFn()` cho trường hợp đơn giản, implement `ServiceDiscoveryHook` cho Consul/K8s.
