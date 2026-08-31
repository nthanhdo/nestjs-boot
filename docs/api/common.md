# Common API Reference

> Shared building blocks — structured exceptions, CRUD base classes, error filters, interceptors, Mongoose error handling, and RFC 7807 Problem Details.

## Classes

### `BootException`

> Extends `HttpException` with a stable machine-readable `code` field that clients can switch on, independent of the human-readable message.

```ts
import { BootException } from '@nestjs-boot/common';

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

#### Constructor

```ts
new BootException(message: string, options?: BootExceptionOptions)
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `message` | `string` | — | Human-readable error message |
| `options.code` | `string` | — | Stable machine-readable error code |
| `options.status` | `number` | `500` | HTTP status code |
| `options.details` | `unknown[]` | — | Additional structured details (e.g. validation field errors) |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string \| undefined` | The stable error code from options |
| `details` | `unknown[] \| undefined` | Additional details from options |

---

### `CrudService<T>`

> Abstract service base class with full CRUD + overridable lifecycle hooks. Pairs with `CrudController<T>`.

Different from `BaseRepository`: `CrudService` is the service layer (business logic hooks, events), while `BaseRepository` is the data-access layer (raw queries, reader/writer split).

```ts
import { CrudService } from '@nestjs-boot/common';

@Injectable()
class ProductService extends CrudService<ProductDocument> {
  constructor(@InjectModel('Product') model: Model<ProductDocument>) {
    super(model);
  }

  protected async beforeCreate(data: Partial<ProductDocument>) {
    data.slug = slugify(data.name!);
    return data;
  }

  protected async afterCreate(doc: ProductDocument) {
    await this.eventBus.emit('product.created', { id: doc._id });
  }
}
```

#### Methods

##### `findAll(filter?: FilterQuery<T>, options?: CrudFindAllOptions): Promise<CrudPaginatedResult<T>>`

Find documents with pagination. Page is clamped to min 1; limit is clamped to 1–100.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `options.page` | `number` | `1` | Page number (1-indexed) |
| `options.limit` | `number` | `20` | Results per page (max 100) |
| `options.sort` | `Record<string, 1 \| -1>` | — | Mongoose sort object |
| `options.select` | `string \| Record<string, 1 \| 0>` | — | Field projection |
| `options.populate` | `string \| string[]` | — | Paths to populate |

##### `findById(id: string): Promise<T | null>`

Find a document by MongoDB `_id`. Returns `null` if not found.

##### `findOne(filter: FilterQuery<T>): Promise<T | null>`

Find a single document by arbitrary filter.

##### `create(data: Partial<T>): Promise<T>`

Create a document. Calls `beforeCreate` → `model.create` → `afterCreate`.

##### `update(id: string, data: Partial<T>): Promise<T | null>`

Update a document by ID (`findByIdAndUpdate` with `new: true`). Calls `beforeUpdate` → update → `afterUpdate`.

##### `delete(id: string): Promise<T | null>`

Delete a document by ID. Calls `beforeDelete` → `findByIdAndDelete` → `afterDelete`.

##### `count(filter?: FilterQuery<T>): Promise<number>`

Count documents matching a filter.

##### `exists(filter: FilterQuery<T>): Promise<boolean>`

Check if at least one document matches the filter.

#### Lifecycle Hooks (override in subclass)

| Hook | Signature | When to use |
|------|-----------|-------------|
| `beforeCreate` | `(data) => Promise<Partial<T>>` | Transform or validate data; return modified data |
| `afterCreate` | `(doc) => Promise<void>` | Emit events, update caches |
| `beforeUpdate` | `(id, data) => Promise<Partial<T>>` | Transform or validate update data |
| `afterUpdate` | `(doc) => Promise<void>` | Side effects after update |
| `beforeDelete` | `(id) => Promise<void>` | Throw to prevent deletion |
| `afterDelete` | `(doc) => Promise<void>` | Clean up related data |

---

### `CrudController<T>`

> Abstract REST controller that pairs with `CrudService<T>`. Provides five standard endpoints with no boilerplate. Override individual methods to add guards or custom logic.

```ts
@Controller('products')
export class ProductController extends CrudController<ProductDocument> {
  constructor(private readonly productService: ProductService) {
    super(productService);
  }

  @Roles('admin')
  @Delete(':id')
  override delete(@Param('id') id: string) {
    return super.delete(id);
  }
}
```

#### Endpoints

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/` | `findAll` | Paginated list. Query params: `page` (default 1), `limit` (default 20) |
| `GET` | `/:id` | `findById` | Find by ID |
| `POST` | `/` | `create` | Create document. Returns HTTP 201 |
| `PUT` | `/:id` | `update` | Update by ID |
| `DELETE` | `/:id` | `delete` | Delete by ID |

**When NOT to use `CrudController`:** GraphQL resolvers, gRPC handlers, non-standard endpoint shapes, or significantly different auth requirements per endpoint. In those cases write the controller manually; `CrudService` is still usable for data access.

---

### `AllExceptionsFilter`

> Catch-all NestJS exception filter. Handles `HttpException`, `ValidationPipe` errors, and unknown errors. Always includes `timestamp` and `path`.

```ts
// Register globally in main.ts:
app.useGlobalFilters(new AllExceptionsFilter());
```

Response shape (see `ErrorResponse` interface below).

#### Static Properties

##### `AllExceptionsFilter.errorReporter`

Optional callback for integrating error monitoring (Sentry, Datadog, etc.) without subclassing:

```ts
AllExceptionsFilter.errorReporter = (error, context) => {
  Sentry.captureException(error, { extra: context });
};
```

---

### `ResponseInterceptor<T>`

> Wraps handler responses into a unified `{ statusCode, message, data }` envelope. Opt-in via `response.envelope: true` in `BootOptions`.

```ts
app.useGlobalInterceptors(new ResponseInterceptor());
```

Behavior:
- Already-enveloped responses (containing `statusCode`) pass through unchanged.
- Paginated responses (`{ data, total, page, limit }`) are spread into the envelope.
- All other responses are wrapped as `{ statusCode, message: 'Success', data: result }`.

---

### `ErrorReporter`

> Singleton pluggable error monitoring integration. Configure once at startup; used automatically by `AllExceptionsFilter`.

```ts
import * as Sentry from '@sentry/node';
import { ErrorReporter } from '@nestjs-boot/common';

ErrorReporter.configure({
  onError: (error, ctx) => Sentry.captureException(error, { extra: ctx }),
  filter: (error) => !(error instanceof NotFoundException),
  enrichContext: (ctx) => ({ ...ctx, environment: process.env.NODE_ENV }),
});
```

#### Methods

##### `ErrorReporter.configure(options: ErrorReporterOptions): void`

Register the monitoring integration. Call once at application startup.

##### `ErrorReporter.reset(): void`

Clear the configuration. Useful in tests.

##### `ErrorReporter.report(error: unknown, context: Partial<ErrorContext>): Promise<void>`

Report an error. Called internally by filters. Errors thrown by `onError` or `enrichContext` are swallowed.

##### `ErrorReporter.extractUserId(request: unknown): string | undefined`

Extract `userId` from `request.user`. Supports `{ id }`, `{ userId }`, and `{ sub }` shapes.

---

### `MongooseErrorInterceptor`

> Global interceptor that catches Mongoose `ValidationError` and `MongoServerError` 11000 (duplicate key) and transforms them into structured `BootException`s.

```ts
// app.module.ts
providers: [
  { provide: APP_INTERCEPTOR, useClass: MongooseErrorInterceptor },
]
```

Alternatively, use the function form for per-service handling:

```ts
import { transformMongooseError } from '@nestjs-boot/common';

try {
  return await this.userModel.create(dto);
} catch (err) {
  throw transformMongooseError(err) ?? err;
}
```

Transformations:
- `ValidationError` → `BootException(DB_VALIDATION_FAILED, 422)` with per-field details
- `MongoServerError` 11000 → `BootException(DB_DUPLICATE_KEY, 409)` with the duplicate field name

---

## Functions

### `errorBoundary<T>(fn, options): Promise<T>`

Wrap an async operation with consistent error handling. Catches errors and either rethrows as `BootException` or returns a fallback value.

```ts
import { errorBoundary } from '@nestjs-boot/common';

// Rethrow as BootException:
const order = await errorBoundary(
  () => orderService.create(data),
  { code: 'ORDER_CREATE_FAILED', status: 500 },
);

// Return null on failure (never throws):
const cached = await errorBoundary(
  () => cache.get(key),
  { code: 'CACHE_MISS', fallback: null },
);
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `code` | `string` | — | **Required.** Stable error code for the wrapped `BootException` |
| `status` | `number` | `500` | HTTP status for the thrown `BootException` |
| `fallback` | `T` | — | Return this value instead of throwing on failure |
| `rethrow` | `boolean` | `true` (or `false` when `fallback` is set) | Whether to rethrow as `BootException` |
| `wrap` | `(error) => boolean` | — | If returns `false`, rethrow the original error unwrapped |

### `errorBoundarySync<T>(fn, options): T`

Synchronous variant of `errorBoundary`.

```ts
const parsed = errorBoundarySync(
  () => JSON.parse(rawInput),
  { code: 'PARSE_FAILED', status: 400, fallback: null },
);
```

### `transformMongooseError(err: unknown): BootException | null`

Attempt to transform a Mongoose error into a `BootException`. Returns `null` when the error is not a recognized Mongoose type — the caller should rethrow the original.

### `toProblemDetails(error, instance?, baseUri?): ProblemDetails`

Convert a `BootException`, `HttpException`, or `ErrorResponse` to an RFC 7807 Problem Details object.

```ts
import { toProblemDetails } from '@nestjs-boot/common';

const pd = toProblemDetails(exception, '/api/orders/123');
// { type: 'about:blank#ORDER_NOT_FOUND', title: 'Not Found', status: 404, ... }
```

---

## Constants / Tokens

### `ErrorCodes`

Stable string constants for use as `code` in `BootException`. Serialize cleanly to JSON and survive tree-shaking.

| Code | Value | Category |
|------|-------|----------|
| `AUTH_TOKEN_EXPIRED` | `'AUTH_TOKEN_EXPIRED'` | Auth |
| `AUTH_TOKEN_INVALID` | `'AUTH_TOKEN_INVALID'` | Auth |
| `AUTH_TOKEN_REVOKED` | `'AUTH_TOKEN_REVOKED'` | Auth |
| `AUTH_INSUFFICIENT_PERMISSIONS` | `'AUTH_INSUFFICIENT_PERMISSIONS'` | Auth |
| `AUTH_RATE_LIMITED` | `'AUTH_RATE_LIMITED'` | Auth |
| `DB_CONNECTION_FAILED` | `'DB_CONNECTION_FAILED'` | Database |
| `DB_DUPLICATE_KEY` | `'DB_DUPLICATE_KEY'` | Database |
| `DB_VALIDATION_FAILED` | `'DB_VALIDATION_FAILED'` | Database |
| `DB_NOT_FOUND` | `'DB_NOT_FOUND'` | Database |
| `TRANSPORT_TIMEOUT` | `'TRANSPORT_TIMEOUT'` | Transport |
| `TRANSPORT_UNAVAILABLE` | `'TRANSPORT_UNAVAILABLE'` | Transport |
| `TRANSPORT_CIRCUIT_OPEN` | `'TRANSPORT_CIRCUIT_OPEN'` | Transport |
| `VALIDATION_FAILED` | `'VALIDATION_FAILED'` | General |
| `RATE_LIMITED` | `'RATE_LIMITED'` | General |
| `INTERNAL_ERROR` | `'INTERNAL_ERROR'` | General |

```ts
import { ErrorCodes } from '@nestjs-boot/common';

throw new BootException('Token expired', {
  code: ErrorCodes.AUTH_TOKEN_EXPIRED,
  status: 401,
});
```

---

## Interfaces

### `BootExceptionOptions`

```ts
interface BootExceptionOptions {
  code?: string;
  status?: number;
  details?: unknown[];
}
```

### `CrudPaginatedResult<T>`

```ts
interface CrudPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

### `CrudFindAllOptions`

```ts
interface CrudFindAllOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
  select?: string | Record<string, 1 | 0>;
  populate?: string | string[];
}
```

### `ErrorResponse`

```ts
interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  code?: string;
  details?: unknown[];
  timestamp: string;
  path: string;
}
```

### `ResponseEnvelope<T>`

```ts
interface ResponseEnvelope<T = unknown> {
  statusCode: number;
  message: string;
  data: T;
  total?: number;  // paginated responses only
  page?: number;
  limit?: number;
}
```

### `ErrorReporterOptions`

```ts
interface ErrorReporterOptions {
  onError: (error: Error, context: ErrorContext) => void | Promise<void>;
  filter?: (error: Error) => boolean;
  enrichContext?: (context: ErrorContext) => ErrorContext;
}
```

### `ErrorContext`

```ts
interface ErrorContext {
  statusCode: number;
  path: string;
  method: string;
  correlationId?: string;
  traceId?: string;
  userId?: string;
  service?: string;
  contextType: 'http' | 'rpc' | 'ws';
  timestamp: string;
}
```

### `ProblemDetails`

```ts
interface ProblemDetails {
  type: string;     // URI reference identifying the problem type
  title: string;    // short human-readable summary
  status: number;   // HTTP status code
  detail?: string;  // explanation specific to this occurrence
  instance?: string; // URI for this specific occurrence
  [key: string]: unknown; // extension fields
}
```

### `ErrorBoundaryOptions<T>`

```ts
interface ErrorBoundaryOptions<T> {
  code: string;
  status?: number;
  fallback?: T;
  rethrow?: boolean;
  wrap?: (error: unknown) => boolean;
}
```

### `ValidationFieldError`

```ts
interface ValidationFieldError {
  field: string;
  message: string;
  value?: unknown;
  kind?: string;
}
```

### `DuplicateKeyDetail`

```ts
interface DuplicateKeyDetail {
  field: string;
  value: unknown;
}
```

### `ErrorCode` (type)

Union type of all registered `ErrorCodes` values:

```ts
type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
```
