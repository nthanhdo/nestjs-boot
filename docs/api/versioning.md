# Versioning API Reference

> Auto-configure API versioning with response headers, deprecation notices, and Sunset signaling.

## Module Registration

```ts
VersioningModule.register(options?: VersioningOptions): DynamicModule
```

Configures versioning and registers `VersionInterceptor` globally (adds `X-API-Version` header and `Sunset`/`Deprecation` headers for deprecated endpoints). The module is global — options and the interceptor are available everywhere.

NestJS `enableVersioning()` is called automatically by `createApp()` when this module is active.

```ts
// In createApp() via BootOptions.versioning
VersioningModule.register({
  type: 'uri',            // 'uri' | 'header' | 'media-type'
  defaultVersion: '1',
})
```

Strategies:
- `'uri'` → `/v1/products` (default — zero client config needed)
- `'header'` → `X-API-Version: 1` request header
- `'media-type'` → `Accept: application/json;version=1`

Defaults:
- `type`: `'uri'`
- `defaultVersion`: `'1'`
- `header`: `'X-API-Version'`
- `mediaTypeKey`: `'version'`

## Classes / Methods

### `VersioningModule.getNestVersioningType`

```ts
static getNestVersioningType(
  type: 'uri' | 'header' | 'media-type',
): VersioningType
```

Returns the NestJS `VersioningType` enum value for the given strategy string. Used internally by `createApp()`.

---

### `VersionInterceptor`

Global interceptor registered automatically by `VersioningModule`.

```ts
@Injectable()
class VersionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>
}
```

On every HTTP response:
1. Resolves the current API version from the request (based on configured strategy).
2. Sets `X-API-Version: {version}` response header.
3. If the handler or controller is decorated with `@DeprecatedVersion(sunset)`:
   - Sets `Sunset: {date}` and `Deprecation: true` response headers.
   - Logs a deprecation warning: `Deprecated API endpoint called: {Class}.{method} — sunset on {date}`.

## Decorators

### `@ApiVersion(version)`

```ts
const ApiVersion: (version: string | string[]) => ClassDecorator & MethodDecorator
```

Marks a controller or route handler for a specific API version. Thin alias over NestJS built-in `@Version()` for consistent naming.

```ts
// Controller-level
@Controller('products')
@ApiVersion('2')
export class ProductsV2Controller {}

// Route-level
@Get()
@ApiVersion('1')
findAllV1() {}

// Multiple versions
@Get()
@ApiVersion(['1', '2'])
findAll() {}
```

---

### `@DeprecatedVersion(sunset)`

```ts
const DeprecatedVersion: (sunset: string) => ClassDecorator & MethodDecorator
```

Marks a controller or route as deprecated. `VersionInterceptor` will add `Sunset` and `Deprecation: true` headers to every response from this endpoint.

```ts
@Controller('products')
@ApiVersion('1')
@DeprecatedVersion('2026-12-31')
export class ProductsV1Controller {}
```

The `sunset` parameter is an ISO 8601 date string representing when this version will be removed.

## Interfaces

### `VersioningOptions`

```ts
interface VersioningOptions {
  /**
   * Versioning strategy:
   * - 'uri'        → /v1/products (default)
   * - 'header'     → X-API-Version: 1
   * - 'media-type' → Accept: application/json;version=1
   */
  type?: 'uri' | 'header' | 'media-type';

  /** Default API version when none is specified. Default: '1' */
  defaultVersion?: string;

  /** Header name for 'header' strategy. Default: 'X-API-Version' */
  header?: string;

  /** Media type key for 'media-type' strategy. Default: 'version' */
  mediaTypeKey?: string;
}
```

## Constants / Tokens

| Token | Value | Description |
|---|---|---|
| `VERSIONING_OPTIONS` | `Symbol('VERSIONING_OPTIONS')` | DI token for the resolved `VersioningOptions` |
| `DEPRECATED_VERSION_KEY` | `'boot:deprecated_version'` | Metadata key for `@DeprecatedVersion` |
