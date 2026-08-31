# RPC API Reference

> Standardized error handling for NestJS microservice transports — gRPC, TCP, NATS, RMQ — with structured error envelopes and HTTP↔gRPC status code mapping.

## Module Registration

```ts
import { RpcModule } from 'nestjs-boot';

@Module({
  imports: [RpcModule.register({ serviceName: 'order-service' })],
})
export class AppModule {}
```

`RpcModule.register()` registers `BootRpcExceptionFilter` as a global `APP_FILTER` so all microservice message handlers are covered automatically.

---

## Classes

### `RpcModule`

`@Module`

#### Static Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(options?: RpcOptions): DynamicModule` | Register the module with an optional `serviceName` tag included in every error envelope. |

---

### `BootRpcExceptionFilter`

`@Catch()` — catches all exceptions in RPC context.

Serializes any exception type to a consistent `RpcErrorEnvelope` and returns it via `throwError()` so the calling service receives a structured, machine-readable error object.

#### Constructor

```ts
constructor(options?: { serviceName?: string })
```

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `catch` | `(exception: unknown, host: unknown): Observable<never>` | Main filter hook — builds envelope, logs, calls error reporter, returns `throwError`. |
| `buildEnvelope` | `(exception: unknown): RpcErrorEnvelope` | `@internal` — converts any exception to a structured envelope. Handles `HttpException`, NestJS `RpcException`, and plain `Error`. |
| `toGrpcError` (static) | `(envelope: RpcErrorEnvelope): { code: GrpcStatus; message: string; details: string }` | Convert an envelope to a gRPC-native error object. `details` contains the JSON-serialized envelope. |

#### Static Error Reporter

```ts
BootRpcExceptionFilter.errorReporter = (error: Error, context: {
  statusCode: number;
  service?: string;
  contextType: string;
}) => void;
```

Set this once at startup to forward exceptions to Sentry, Datadog, etc. without subclassing.

```ts
BootRpcExceptionFilter.errorReporter = (err, ctx) => {
  Sentry.captureException(err, { extra: ctx });
};
```

#### Per-handler Usage

When not registered globally, apply per handler:

```ts
@UseFilters(new BootRpcExceptionFilter({ serviceName: 'order-service' }))
@MessagePattern('create_order')
createOrder(data: CreateOrderDto) { ... }
```

---

### `GrpcStatus` (enum)

gRPC status codes mirrored without requiring `@grpc/grpc-js` as a dependency.

```ts
enum GrpcStatus {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}
```

---

## Functions

### `deserializeRpcError(error: unknown): HttpException`

Deserializes a received RPC error back into a proper NestJS `HttpException` for use at the API gateway or calling service side.

Handles four shapes in priority order:
1. Already an `HttpException` — returned as-is.
2. `RpcErrorEnvelope` object with `statusCode` and `message`.
3. gRPC-style object with numeric `code` — maps via `grpcStatusToHttp`. If `details` is a JSON-serialized envelope, recursively deserializes it.
4. Object with `causes` array (hop chain).
5. Fallback: `Error.message` or string → 500 `InternalServerError`.

```ts
// In a ClientProxy interceptor or catch block:
catchError((err) => {
  throw deserializeRpcError(err);
})
```

---

### `isRetryable(error: unknown): boolean`

Returns `true` for HTTP status codes that indicate a retryable condition:
`408` (Timeout), `429` (Too Many Requests), `503` (Service Unavailable), `504` (Gateway Timeout).

Works with `HttpException`, `RpcErrorEnvelope`, or any plain object with a `statusCode` / `status` field.

```ts
catchError((err) => {
  if (isRetryable(err)) {
    return retry({ count: 3, delay: 1000 })(source);
  }
  throw deserializeRpcError(err);
})
```

---

### `httpStatusToGrpc(httpStatus: number): GrpcStatus`

Convert an HTTP status code to the nearest gRPC status code. Unknown codes default to `GrpcStatus.INTERNAL` (13).

---

### `grpcStatusToHttp(grpcStatus: number): number`

Convert a gRPC status code to the nearest HTTP status code. Unknown codes default to `500`.

**Mapping table:**

| HTTP | gRPC |
|------|------|
| 200 | OK (0) |
| 400 / 422 | INVALID_ARGUMENT (3) |
| 401 | UNAUTHENTICATED (16) |
| 403 | PERMISSION_DENIED (7) |
| 404 | NOT_FOUND (5) |
| 408 | DEADLINE_EXCEEDED (4) |
| 409 | ALREADY_EXISTS (6) |
| 412 | FAILED_PRECONDITION (9) |
| 416 | OUT_OF_RANGE (11) |
| 429 | RESOURCE_EXHAUSTED (8) |
| 499 | CANCELLED (1) |
| 500 | INTERNAL (13) |
| 501 | UNIMPLEMENTED (12) |
| 503 | UNAVAILABLE (14) |

---

## Interfaces

### `RpcErrorEnvelope`

The structured error shape serialized by `BootRpcExceptionFilter` and returned through the transport.

```ts
interface RpcErrorEnvelope {
  /** HTTP-equivalent status code */
  statusCode: number;
  /** Human-readable error message */
  message: string;
  /** Error class name (e.g., 'NotFoundException') */
  error: string;
  /** Stable machine-readable code (e.g., 'PRODUCT_NOT_FOUND') */
  code?: string;
  /** Validation error details array */
  details?: unknown[];
  /** Upstream error chain preserved across service hops */
  causes?: RpcErrorEnvelope[];
  /** Correlation ID from AsyncLocalStorage */
  correlationId?: string;
  /** ISO timestamp */
  timestamp: string;
  /** Service name from RpcModule.register() */
  service?: string;
}
```

### `RpcOptions`

```ts
interface RpcOptions {
  /** Service name included in error responses for debugging / tracing */
  serviceName?: string;
}
```

---

## Constants / Tokens

| Constant | Value | Purpose |
|----------|-------|---------|
| `RPC_OPTIONS` | `Symbol('RPC_OPTIONS')` | Injection token for `RpcOptions`. |
