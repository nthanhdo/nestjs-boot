# Transport API Reference

> Hybrid microservice transport layer with typed client proxies, service discovery, resilience patterns, and structured RPC error context.

## Module Registration

```ts
TransportModule.register(options: TransportOptions): DynamicModule
```

Registers named client proxies via `ClientProxyFactory.create()` from `@nestjs/microservices`. The module is global — registered clients are available everywhere without re-importing.

Gracefully degrades (logs a warning, provides no clients) if `@nestjs/microservices` is not installed.

```ts
TransportModule.register({
  clients: {
    ORDER_SERVICE: {
      transport: 'grpc',
      options: {
        url: '0.0.0.0:5000',
        package: 'order',
        protoPath: './proto/order.proto',
      },
    },
    NOTIFICATION_SERVICE: {
      transport: 'nats',
      options: { url: 'nats://localhost:4222' },
    },
  },
})
```

Server-side transports (gRPC, TCP, NATS, RabbitMQ) are connected by `connectTransports()`, called automatically by `createApp()`.

## Functions

### `connectTransports`

```ts
async function connectTransports(
  app: INestApplication,
  options: TransportOptions,
): Promise<void>
```

Connect microservice transports to an existing NestJS application. Calls `app.connectMicroservice()` for each configured transport then `app.startAllMicroservices()`. Validates options before connecting (throws descriptive errors for missing required fields).

---

### `validateTransportOptions`

```ts
function validateTransportOptions(options: TransportOptions): void
```

Validate transport options at module init time. Throws clear error messages for missing required fields (`url`, `package`, `protoPath` for gRPC; `url` for NATS; `urls`+`queue` for RabbitMQ).

---

### `createResilientClient`

```ts
function createResilientClient<T extends ServiceInterface>(
  client: { send: (pattern: any, data: any) => any },
  options: ResilientClientOptions,
): ResilientServiceClient<T>
```

Wrap a NestJS `ClientProxy` with per-call timeout, retry with backoff, and a circuit breaker — all optional and composable.

Composition order (outer → inner): `circuit-breaker → retry → timeout → correlation + auth → send`

```ts
const resilient = createResilientClient<OrderService>(clientProxy, {
  timeout: 5000,
  retry: { maxAttempts: 3, backoff: 'exponential' },
  circuitBreaker: { failureThreshold: 5 },
});

const order = await resilient.call('findOrder', { id: '123' });
```

---

### `fromResolverFn`

```ts
function fromResolverFn(fn: () => Promise<DiscoveryResult>): ServiceDiscoveryHook
```

Utility that creates a `ServiceDiscoveryHook` from a plain async function.

```ts
discover: fromResolverFn(async () => ({
  url: await dns.lookup('order-service.svc.cluster.local'),
}))
```

---

### `staticUrl`

```ts
function staticUrl(url: string): ServiceDiscoveryHook
```

Static discovery — always returns the same URL. Equivalent to no discovery, but keeps a consistent config shape across environments.

## Classes / Methods

### `ServiceClient<T>`

Typed wrapper around `ClientProxy` for type-safe inter-service calls. Auto-forwards `correlationId` and auth headers from `AsyncLocalStorage`.

```ts
class ServiceClient<T extends Record<string, (...args: any[]) => any>> {
  constructor(client: { send: (pattern: any, data: any) => any })

  /**
   * Call a remote service method with type safety.
   * Auto-includes correlationId + auth in message metadata.
   */
  async call<K extends keyof T & string>(
    method: K,
    data: Parameters<T[K]>[0],
  ): Promise<ReturnType<T[K]>>

  /**
   * Emit a fire-and-forget event.
   */
  emit<K extends keyof T & string>(
    event: K,
    data: Parameters<T[K]>[0],
  ): void
}
```

```ts
interface OrderService {
  createOrder(data: CreateOrderDto): OrderResponseDto;
  getOrder(data: { id: string }): OrderResponseDto;
}

const orderClient = new ServiceClient<OrderService>(clientProxy);
const order = await orderClient.call('createOrder', { items: [...] });
```

---

### `ResilientServiceClient<T>`

Extends `ServiceClient<T>` with timeout, retry, and circuit breaker.

```ts
class ResilientServiceClient<T> extends ServiceClient<T> {
  constructor(
    client: { send: (pattern: any, data: any) => any },
    options: ResilientClientOptions,
  )

  /** Call with timeout + retry + circuit breaker applied. */
  override async call<K extends keyof T & string>(
    method: K,
    data: Parameters<T[K]>[0],
  ): Promise<ReturnType<T[K]>>

  /** Circuit breaker state — useful for health checks / dashboards. */
  getCircuitState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'DISABLED'
}
```

---

### `ErrorContextInterceptor`

NestJS interceptor that preserves inter-service error context across RPC hops. Re-throws raw RPC errors as `BootRpcException` with structured context.

```ts
@Injectable()
class ErrorContextInterceptor implements NestInterceptor {
  constructor(options: ErrorContextOptions)

  intercept(context: ExecutionContext, next: CallHandler): Observable<any>
}
```

What it provides on `BootRpcException`:
- `err.code` — application-defined error code (e.g. `'ORDER_NOT_FOUND'`)
- `err.context.service` — originating service name
- `err.context.correlationId` — correlation ID at time of error
- `err.context.upstreamChain` — full call path (e.g. `['api-gateway', 'order-service']`)
- `err.context.status` — HTTP status code mapping

```ts
// Global registration
app.useGlobalInterceptors(
  new ErrorContextInterceptor({ serviceName: 'order-service' }),
);

// Catch in service code
try {
  await orderClient.call('findOrder', { id: '123' });
} catch (err) {
  if (err instanceof BootRpcException) {
    console.log(err.code);                   // 'ORDER_NOT_FOUND'
    console.log(err.context.upstreamChain);  // ['api-gateway', 'order-service']
  }
}
```

---

### `BootRpcException`

```ts
class BootRpcException extends Error {
  constructor(
    message: string,
    code?: string,  // default: 'RPC_ERROR'
    context?: {
      service?: string;
      correlationId?: string;
      upstreamChain?: string[];
      status?: number;
    },
  )

  readonly code: string
  readonly context: { service?; correlationId?; upstreamChain?; status? }
}
```

## Decorators

### `@InjectGrpcClient(name)`

```ts
function InjectGrpcClient(name: string): ParameterDecorator
```

Inject a named gRPC client proxy by its name as defined in `TransportOptions.clients`.

```ts
constructor(@InjectGrpcClient('ORDER_SERVICE') private readonly client: ClientGrpc) {}
```

---

### `@InjectClient(name)`

```ts
function InjectClient(name: string): ParameterDecorator
```

Inject a named transport client proxy (any transport type).

```ts
constructor(@InjectClient('NOTIFICATION_SERVICE') private readonly client: ClientProxy) {}
```

---

### `getClientToken(name)`

```ts
function getClientToken(name: string): string
```

Get the DI injection token for a named transport client. Token format: `TRANSPORT_CLIENT_{name}`.

## Interfaces

### `TransportOptions`

```ts
interface TransportOptions {
  grpc?: GrpcTransportOptions;
  tcp?: TcpTransportOptions;
  nats?: NatsTransportOptions;
  rabbitmq?: RmqTransportOptions;
  clients?: Record<string, ClientTransportOptions>;
}
```

### `GrpcTransportOptions`

```ts
interface GrpcTransportOptions {
  url: string;                         // e.g. '0.0.0.0:5000'
  package: string | string[];          // proto package name(s)
  protoPath: string | string[];        // path(s) to .proto file(s)
  loader?: {
    keepCase?: boolean;
    longs?: Function;
    enums?: Function;
    defaults?: boolean;
    oneofs?: boolean;
    includeDirs?: string[];
  };
  credentials?: unknown;               // for mTLS
}
```

### `TcpTransportOptions`

```ts
interface TcpTransportOptions {
  host?: string;   // default: '0.0.0.0'
  port?: number;   // default: 3001
}
```

### `NatsTransportOptions`

```ts
interface NatsTransportOptions {
  url: string;     // e.g. 'nats://localhost:4222'
  queue?: string;  // queue group name
}
```

### `RmqTransportOptions`

```ts
interface RmqTransportOptions {
  urls: string[];                      // AMQP URLs
  queue: string;                       // queue name
  queueOptions?: { durable?: boolean };
}
```

### `ClientTransportOptions`

```ts
interface ClientTransportOptions {
  transport: 'grpc' | 'tcp' | 'nats' | 'rabbitmq';
  options: GrpcTransportOptions | TcpTransportOptions | NatsTransportOptions | RmqTransportOptions;
}
```

### `ResilientClientOptions`

```ts
interface ResilientClientOptions {
  /** Per-call timeout in milliseconds. */
  timeout?: number;

  /** Retry configuration. */
  retry?: {
    maxAttempts?: number;           // default: 3
    backoff?: 'exponential' | 'fixed';  // default: 'exponential'
    delay?: number;                 // base delay ms. default: 1000
    maxDelay?: number;              // max delay ms. default: 10000
    retryOn?: (err: Error) => boolean;  // predicate; retries all if omitted
  };

  /** Circuit breaker configuration. */
  circuitBreaker?: {
    failureThreshold: number;       // consecutive failures to open circuit
    resetTimeout?: number;          // ms before HALF_OPEN attempt
  };
}
```

### `ErrorContextOptions`

```ts
interface ErrorContextOptions {
  serviceName: string;       // name of this service (added to error chain)
  includeStack?: boolean;    // include stack traces. Default: false
}
```

### `ServiceDiscoveryHook`

```ts
interface ServiceDiscoveryHook {
  /** Called at module init and optionally on connection failure. */
  resolve(): Promise<{ url: string }>;
}
```

### `ServiceDiscoveryPolicy`

```ts
interface ServiceDiscoveryPolicy {
  retryOnFailure?: boolean;  // re-resolve on reconnect. Default: false
  ttlMs?: number;            // max age of resolved URL ms. Default: 0 (disabled)
}
```

### `DiscoveryResult`

```ts
interface DiscoveryResult {
  url: string;  // fully-qualified URL of the service
}
```

## Constants / Tokens

| Token | Value | Description |
|---|---|---|
| `TRANSPORT_OPTIONS` | `'TRANSPORT_OPTIONS'` | DI token for the `TransportOptions` object |
| `TRANSPORT_CLIENT_PREFIX` | `'TRANSPORT_CLIENT_'` | Prefix for client proxy injection tokens |
| `TRANSPORT_TYPE_MAP` | `{ grpc, tcp, nats, rabbitmq }` | Maps string keys to NestJS `Transport` enum values |
