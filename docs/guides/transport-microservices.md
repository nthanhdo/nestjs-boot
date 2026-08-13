# Transport and Microservices

Inter-service communication with `TransportModule` (gRPC, TCP, NATS, RabbitMQ), typed service clients, resilience patterns (timeout, retry, circuit breaker), service discovery, and cross-service error propagation.

## TransportModule Setup

Register named client proxies for outbound calls and connect server transports for inbound messages.

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

`TransportModule` is `@Global()`. It requires `@nestjs/microservices` as a peer dependency — if not installed, a warning is logged and no clients are registered (graceful degradation).

### Injecting Clients

Use `@InjectClient()` or `@InjectGrpcClient()` to inject named client proxies:

```ts
import { InjectClient } from 'nestjs-boot';

@Injectable()
export class OrderService {
  constructor(@InjectClient('ORDER_SERVICE') private readonly orderClient: ClientProxy) {}
}
```

### connectTransports()

For hybrid apps that serve both HTTP and microservice transports, call `connectTransports()` in your bootstrap:

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

Transport options are validated at startup — missing required fields (e.g. gRPC without `url`, `package`, or `protoPath`) throw descriptive errors immediately.

## ServiceClient\<T\> — Typed Calls

Wrap a `ClientProxy` with `ServiceClient<T>` for type-safe inter-service calls with automatic correlation ID and auth context forwarding.

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

Both `call()` and `emit()` automatically inject:
- **Correlation ID** from `AsyncLocalStorage` (via the correlation module)
- **Auth context** (JWT token, API key) from `AsyncLocalStorage` (via the inter-service-auth module)

## ResilientServiceClient — Timeout, Retry, Circuit Breaker

Wrap a client proxy with `createResilientClient()` to add per-call resilience. All three features are optional and composable.

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

### Resilience Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | — | Per-call timeout in ms. Rejects with timeout error if exceeded |
| `retry.maxAttempts` | `number` | `3` | Maximum retry attempts |
| `retry.backoff` | `'exponential' \| 'fixed'` | `'exponential'` | Backoff strategy |
| `retry.delay` | `number` | `1000` | Base delay in ms |
| `retry.maxDelay` | `number` | `10000` | Maximum delay cap |
| `retry.retryOn` | `(err) => boolean` | — | Predicate to filter retryable errors |
| `circuitBreaker.failureThreshold` | `number` | — | Consecutive failures before opening |
| `circuitBreaker.resetTimeout` | `number` | — | Time in ms before half-open attempt |

## Service Discovery

`ServiceDiscoveryHook` is an interface for dynamic URL resolution. Implement it with Consul, Kubernetes DNS, environment variables, or any registry.

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

Resolution lifecycle:
1. **Module init** — `resolve()` is called once per client before the first connection.
2. **Connection failure** — If `retryOnFailure: true`, `resolve()` is called again before each reconnect.

If `resolve()` throws at startup, module initialization fails fast with a descriptive error.

## Inter-Service Error Context

### ErrorContextInterceptor

Preserves error context across RPC hops. When a downstream call fails, it enriches the error with the service name, correlation ID, and upstream call chain.

```ts
import { ErrorContextInterceptor } from 'nestjs-boot';

// Global registration
const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(
  new ErrorContextInterceptor({ serviceName: 'api-gateway' }),
);
```

### BootRpcException

Structured RPC error with traceable context:

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

Standardized exception filter for microservice transports. Register globally via `RpcModule`:

```ts
import { RpcModule } from 'nestjs-boot';

@Module({
  imports: [RpcModule.register({ serviceName: 'order-service' })],
})
export class AppModule {}
```

The filter catches any exception in RPC context and serializes it to a structured envelope matching the HTTP `AllExceptionsFilter` format. It includes a static `toGrpcError()` method for gRPC-native error conversion.

### HTTP-gRPC Status Code Mapping

Bidirectional mapping between HTTP and gRPC status codes:

| HTTP | gRPC | Description |
|------|------|-------------|
| 400 | `INVALID_ARGUMENT` (3) | Bad request / validation error |
| 401 | `UNAUTHENTICATED` (16) | Missing or invalid credentials |
| 403 | `PERMISSION_DENIED` (7) | Insufficient permissions |
| 404 | `NOT_FOUND` (5) | Resource not found |
| 408 | `DEADLINE_EXCEEDED` (4) | Request timeout |
| 409 | `ALREADY_EXISTS` (6) | Conflict |
| 429 | `RESOURCE_EXHAUSTED` (8) | Rate limited |
| 500 | `INTERNAL` (13) | Internal server error |
| 503 | `UNAVAILABLE` (14) | Service unavailable |

Use `httpStatusToGrpc()` and `grpcStatusToHttp()` for explicit conversions.

### deserializeRpcError / isRetryable

At the API gateway or calling service, deserialize RPC errors back into `HttpException`:

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

## Transport Config Options

| Option | Type | Description |
|--------|------|-------------|
| `grpc.url` | `string` | gRPC bind address (e.g. `'0.0.0.0:5000'`) |
| `grpc.package` | `string \| string[]` | Proto package name(s) |
| `grpc.protoPath` | `string \| string[]` | Path(s) to `.proto` file(s) |
| `grpc.loader` | `object` | Proto loader options (`keepCase`, `longs`, etc.) |
| `grpc.credentials` | `unknown` | gRPC channel credentials (for mTLS) |
| `tcp.host` | `string` | TCP bind host (default `'0.0.0.0'`) |
| `tcp.port` | `number` | TCP bind port (default `3001`) |
| `nats.url` | `string` | NATS server URL |
| `nats.queue` | `string` | Queue group name |
| `rabbitmq.urls` | `string[]` | RabbitMQ connection URLs |
| `rabbitmq.queue` | `string` | Queue name |
| `rabbitmq.queueOptions` | `{ durable?: boolean }` | Queue options |

## Best Practices

1. **Use `ResilientServiceClient` for all cross-service calls.** Timeout + retry + circuit breaker should be the default, not an afterthought.
2. **Register `ErrorContextInterceptor` globally** on every service. The upstream chain in errors makes debugging distributed failures straightforward.
3. **Register `RpcModule`** on every microservice to standardize error envelopes across transports.
4. **Use `ServiceClient<T>`** for type safety. Define the remote interface once, share it across services.
5. **Keep timeouts tight** (2-5s for synchronous calls). A slow downstream should not cascade.
6. **Use `isRetryable()`** to avoid retrying client errors (400, 403, 404) — only retry transient failures.
7. **Service discovery** keeps transport config environment-agnostic. Use `fromResolverFn()` for simple cases, implement `ServiceDiscoveryHook` for Consul/K8s.
