# Error Handling

> **TL;DR** — Throw `BootException` with a stable `code` for client-safe errors. `AllExceptionsFilter` catches everything and produces structured JSON. Use `errorBoundary` at service boundaries, `MongooseErrorInterceptor` for DB errors, and `ErrorReporter` for Sentry/Datadog integration.

nestjs-boot provides a layered error handling system: structured exceptions with stable codes, global filters, response envelopes, Mongoose error transformation, error boundaries, and optional RFC 7807 Problem Details output.

## BootException

`BootException` extends `HttpException` with a stable `code` field that clients can switch on, decoupled from human-readable messages that may change between versions.

```ts
import { BootException } from 'nestjs-boot/common';

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

Options: `code` (string), `status` (number, default 500), `details` (unknown[]).

## ErrorCodes Registry

A centralized registry of stable machine-readable error codes. These are plain string constants (not enums) so they serialize cleanly to JSON and survive tree-shaking.

```ts
import { BootException, ErrorCodes } from 'nestjs-boot/common';

throw new BootException('Token has expired', {
  code: ErrorCodes.AUTH_TOKEN_EXPIRED,
  status: 401,
});
```

Built-in categories: `AUTH_*` (token expired/invalid/revoked, insufficient permissions, rate limited), `DB_*` (connection failed, duplicate key, validation failed, not found), `TRANSPORT_*` (timeout, unavailable, circuit open), and general (`VALIDATION_FAILED`, `RATE_LIMITED`, `INTERNAL_ERROR`).

Add your own codes alongside the built-in ones. The `ErrorCode` union type covers all registered values.

## AllExceptionsFilter

A global catch-all filter that produces structured JSON error responses with timestamp, path, and optional stable error code.

```ts
// app.module.ts
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from 'nestjs-boot/common';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

Response shape (`ErrorResponse`):

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

The filter handles HTTP, RPC, and WebSocket contexts. For RPC, it rethrows the exception so NestJS RpcExceptionFilter can handle transport-level errors. ValidationPipe errors (where `message` is an array) are automatically extracted into the `details` field.

### Error Reporter Integration

Wire external monitoring (Sentry, Datadog) without subclassing:

```ts
import { ErrorReporter } from 'nestjs-boot/common';
import * as Sentry from '@sentry/node';

ErrorReporter.configure({
  onError: (error, ctx) => Sentry.captureException(error, { extra: ctx }),
  filter: (error) => !(error instanceof NotFoundException), // skip 404s
  enrichContext: (ctx) => ({ ...ctx, environment: process.env.NODE_ENV }),
});
```

The reporter receives full `ErrorContext` including `statusCode`, `path`, `method`, `correlationId`, `traceId` (auto-extracted from OpenTelemetry), and `contextType`. Errors thrown inside the reporter are swallowed to prevent cascading failures.

## ResponseInterceptor

Wraps successful responses in a unified envelope. Opt in via `APP_INTERCEPTOR`:

```ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from 'nestjs-boot/common';

providers: [
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
]
```

Plain responses become `{ statusCode, message: "Success", data }`. Paginated responses (objects with `data`, `total`, `page`, `limit` fields) spread those fields into the envelope. Already-enveloped responses (objects with a `statusCode` field) pass through unchanged.

## MongooseErrorInterceptor

Catches the two most common Mongoose errors and transforms them into structured BootExceptions.

**ValidationError** becomes a 422 with per-field details:

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

**MongoServerError 11000** (duplicate key) becomes a 409 Conflict with the offending field.

Two usage patterns:

```ts
// Global — register as APP_INTERCEPTOR
{ provide: APP_INTERCEPTOR, useClass: MongooseErrorInterceptor }

// Per-service — targeted handling
import { transformMongooseError } from 'nestjs-boot/common';

async create(dto: CreateUserDto) {
  try {
    return await this.userModel.create(dto);
  } catch (err) {
    throw transformMongooseError(err) ?? err;
  }
}
```

## errorBoundary / errorBoundarySync

Wraps operations with consistent error handling. Catches errors, wraps them in BootException with a stable code, and either rethrows or returns a fallback.

```ts
import { errorBoundary, errorBoundarySync } from 'nestjs-boot/common';

// Rethrow as BootException (default)
const order = await errorBoundary(
  () => this.orderService.create(data),
  { code: 'ORDER_CREATE_FAILED', status: 500 },
);

// Return null on failure (never throws)
const cached = await errorBoundary(
  () => this.cache.get(key),
  { code: 'CACHE_MISS', fallback: null },
);

// Synchronous variant
const parsed = errorBoundarySync(
  () => JSON.parse(rawInput),
  { code: 'PARSE_FAILED', status: 400, fallback: null },
);
```

Options: `code` (required), `status` (default 500), `fallback` (return instead of throwing), `rethrow` (default true unless fallback is set), `wrap` (predicate: return false to let original error pass through). Already-wrapped BootExceptions with a code are preserved rather than double-wrapped.

## RFC 7807 Problem Details

Opt-in RFC 7807/9457 compliant error format via `toProblemDetails()`:

```ts
import { toProblemDetails } from 'nestjs-boot/common';

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

When a stable error code exists, it is appended as a URI fragment to the `type` field. Override `baseUri` to point to your error documentation site: `toProblemDetails(err, path, 'https://docs.myapp.com/errors')`.

The function accepts `BootException`, `HttpException`, or the serialized `ErrorResponse` shape from the filter.

## Best Practices

- Define domain-specific error codes as constants alongside `ErrorCodes` rather than using raw strings
- Use `errorBoundary` at service boundaries (external APIs, cache, file I/O) to normalize errors
- Register `MongooseErrorInterceptor` globally for consistent database error responses
- Wire `ErrorReporter` in `main.ts` before the app starts listening
- Use the `code` field (not `message`) for client-side error handling logic
- Keep `AllExceptionsFilter` as the outermost filter; layer interceptors inside it

## See also

- [Observability](observability.md) — correlation IDs and tracing that enrich error context
- [Transport & Microservices](transport-microservices.md) — `BootRpcException` for cross-service errors
- [Resilience](resilience.md) — circuit breaker and retry for handling upstream failures
