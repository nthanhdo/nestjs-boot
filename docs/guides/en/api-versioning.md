# API Versioning

> **TL;DR** — Add `versioning: { type: 'uri' }` to BootOptions. Use `@ApiVersion('2')` on controllers and `@DeprecatedVersion('2026-12-31')` to mark old versions with automatic `Sunset` headers.

`VersioningModule` adds URI, header, or media-type API versioning with automatic response headers and deprecation tracking.

## Setup

```ts
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  versioning: { type: 'uri', defaultVersion: '1' },
});
```

Or register the module directly:

```ts
import { VersioningModule } from 'nestjs-boot/versioning';

@Module({
  imports: [VersioningModule.register({ type: 'header', header: 'X-API-Version' })],
})
export class AppModule {}
```

## Versioning Strategies

| Strategy | Client sends | Route example |
|----------|-------------|---------------|
| `uri` (default) | `GET /v2/products` | Path prefix `/v{N}` |
| `header` | `X-API-Version: 2` | Any path |
| `media-type` | `Accept: application/json;version=2` | Any path |

## @ApiVersion Decorator

Alias for NestJS `@Version()` with consistent naming:

```ts
@Controller('products')
@ApiVersion('2')
export class ProductsV2Controller {
  @Get()
  findAll() { return []; }

  @Get(':id')
  @ApiVersion(['2', '3']) // multiple versions
  findOne(@Param('id') id: string) { return { id }; }
}
```

## @DeprecatedVersion Decorator

Marks endpoints as deprecated. `VersionInterceptor` adds `Sunset` and `Deprecation: true` headers automatically:

```ts
@Controller('products')
@ApiVersion('1')
@DeprecatedVersion('2026-12-31')
export class ProductsV1Controller {
  @Get()
  findAll() { return []; }
}
```

Response headers for deprecated endpoints:

```
X-API-Version: 1
Sunset: 2026-12-31
Deprecation: true
```

A warning is also logged: `Deprecated API endpoint called: ProductsV1Controller.findAll — sunset on 2026-12-31`.

## VersionInterceptor

Registered globally by `VersioningModule`. On every HTTP response it:

1. Resolves the current version from the request (path prefix, header, or accept header depending on strategy).
2. Sets `X-API-Version` response header.
3. Checks `@DeprecatedVersion` metadata and adds `Sunset`/`Deprecation` headers if present.

## Configuration Reference

```ts
interface VersioningOptions {
  type?: 'uri' | 'header' | 'media-type'; // default: 'uri'
  defaultVersion?: string;                 // default: '1'
  header?: string;                         // default: 'X-API-Version'
  mediaTypeKey?: string;                   // default: 'version'
}
```

## Best Practices

- Start with URI versioning for simplicity; switch to header versioning when you need version-agnostic URLs.
- Set a concrete `Sunset` date when deprecating a version so clients can plan migration.
- Keep `defaultVersion` at `'1'` and explicitly decorate newer controllers with `@ApiVersion('2')`.
- Avoid supporting more than 2 active versions simultaneously to limit maintenance cost.

## Common Pitfalls

- **Unversioned routes shadow versioned ones** — A controller without `@ApiVersion()` matches all versions. If you add a versioned controller for the same path, the unversioned one may still win depending on registration order.
- **Media-type strategy requires `Accept` header parsing** — Clients must send `Accept: application/json;version=2`. If your API gateway strips or rewrites `Accept`, version detection breaks.
