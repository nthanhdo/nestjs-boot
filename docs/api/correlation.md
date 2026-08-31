# Correlation API Reference

> Automatic correlation ID propagation across HTTP requests, RPC calls, and async contexts via `AsyncLocalStorage`.

## Module Registration

```ts
CorrelationModule.register(options?: CorrelationOptions)
```

Registers globally — applies `CorrelationIdMiddleware` to all routes (`'*'`).

```ts
// app.module.ts
imports: [
  CorrelationModule.register({
    header: 'X-Request-Id',         // custom header name
    generator: () => myUUIDv7(),    // custom ID generator
  }),
]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `header` | `string` | `'X-Correlation-Id'` | Header name to read from incoming requests and write to responses |
| `generator` | `() => string` | `crypto.randomUUID()` | Custom ID generator function |

---

## Classes

### `CorrelationIdMiddleware`

NestJS middleware applied to all routes. Reads the correlation ID from the incoming request header (or generates one), then runs the rest of the request inside an `AsyncLocalStorage` context so the ID is available anywhere downstream without prop-drilling.

Also handles W3C `traceparent` header propagation: if `@opentelemetry/api` is installed, it extracts the OTel context and continues the trace.

#### `use(req, res, next): void`

Standard NestJS/Express middleware signature. Not called directly.

---

### `CorrelationInterceptor`

NestJS interceptor that ensures the correlation ID is attached to HTTP response headers. Register globally or per-controller.

```ts
// Global registration:
app.useGlobalInterceptors(new CorrelationInterceptor());

// Per-module:
providers: [{ provide: APP_INTERCEPTOR, useClass: CorrelationInterceptor }]
```

#### `intercept(context, next): Observable<any>`

Standard NestJS interceptor signature. For HTTP contexts, sets `X-Correlation-Id` (or configured header) on the response.

---

## Functions

### `getCorrelationId(): string | undefined`

Returns the current correlation ID from `AsyncLocalStorage`. Returns `undefined` if called outside a request context (e.g., background jobs not wrapped in `runWithCorrelationId`).

```ts
import { getCorrelationId } from '@nestjs-boot/correlation';

const id = getCorrelationId(); // 'a1b2c3d4-...'
```

---

### `setCorrelationId(id): void`

Updates the correlation ID in the current `AsyncLocalStorage` store. Only works inside an active store context (i.e., within a request or a `runWithCorrelationId` callback).

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | New correlation ID to set |

---

### `runWithCorrelationId<T>(id, fn): T`

Runs `fn` inside a new `AsyncLocalStorage` context with the given correlation ID. Use for background tasks, workers, or tests.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Correlation ID to set for the duration of `fn` |
| `fn` | `() => T` | Function to execute within the context |

```ts
await runWithCorrelationId('trace-123', async () => {
  await myService.doWork(); // getCorrelationId() returns 'trace-123' here
});
```

---

### `getTraceparent(): string | undefined`

Returns the W3C `traceparent` header value from the current context, if present. Used for OpenTelemetry trace continuation.

---

### `withCorrelationId(metadata?): Record<string, any>`

Injects the current correlation ID into a metadata object for outgoing `ClientProxy` (microservice) calls.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `metadata` | `Record<string, any>` | `{}` | Base metadata object to extend |

Returns a new object with `correlationId` added (or the original object unchanged if no active correlation ID).

```ts
const metadata = withCorrelationId({});
this.client.send('pattern', { data, metadata });
```

---

## Constants / Tokens

| Name | Value | Description |
|------|-------|-------------|
| `CORRELATION_HEADER` | `'X-Correlation-Id'` | Default header name |
| `CORRELATION_OPTIONS` | `'CORRELATION_OPTIONS'` | Injection token for module options |
