# Swagger / OpenAPI

> **TL;DR** — Add `swagger: { path: '/api/docs' }` to BootOptions. Bearer and API key security schemes are added automatically. Use `@ApiTag`, `@ApiPaginated`, `@ApiErrorResponses`, and `@AutoApiProperties` to document endpoints with minimal boilerplate. All decorators no-op gracefully when `@nestjs/swagger` is not installed.

`setupSwagger()` auto-configures Swagger UI with Bearer/ApiKey security, pagination schemas, and error response docs. Gracefully no-ops when `@nestjs/swagger` is not installed.

## Setup

```ts
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  swagger: {
    path: '/api/docs',
    title: 'My API',
    description: 'Product catalog service',
    auth: true,
    tags: [{ name: 'products', description: 'Product operations' }],
  },
});
```

Swagger UI serves at `/api/docs` and JSON spec at `/api/docs-json`. Enabled by default in development, disabled in production (override with `enabled: true`).

## Configuration Reference

```ts
interface SwaggerOptions {
  enabled?: boolean;               // default: !production
  path?: string;                   // default: '/api/docs'
  title?: string;                  // default: package.json name
  description?: string;
  version?: string;                // default: package.json version
  servers?: Array<{ url: string; description?: string }>;
  auth?: boolean;                  // default: true when auth module is configured
  tags?: Array<{ name: string; description?: string }>;
}
```

## Security Schemes

When `auth: true` (or when the auth module is detected), two security schemes are added automatically:

- **Bearer** — `Authorization: Bearer <jwt>`
- **ApiKey** — `x-api-key: <key>` header

No manual `DocumentBuilder` calls needed.

## Decorators

### @ApiTag

Groups a controller under a Swagger sidebar tag:

```ts
@ApiTag('products')
@Controller('products')
export class ProductsController {}
```

### @ApiResponse

Documents a success response with a DTO type:

```ts
@ApiResponse(201, CreateProductDto)
@Post()
create(@Body() dto: CreateProductDto) {}
```

### @ApiPaginated

Documents a paginated response with the `{ data, total, page, limit, hasNext }` shape:

```ts
@ApiPaginated(ProductDto)
@Get()
findAll(@Query() query: PaginationDto) {}
```

### @ApiErrorResponses

Adds standard 400/401/403/404/500 error schemas in one decorator:

```ts
@ApiErrorResponses()
@Get(':id')
findOne(@Param('id') id: string) {}
```

### @AutoApiProperties

Auto-generates `@ApiProperty()` from class-validator decorators on a DTO, eliminating duplication:

```ts
@AutoApiProperties()
export class CreateProductDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  price?: number;
}
```

Infers `type` from `@IsString`, `@IsNumber`, `@IsBoolean`, `@IsArray` and marks fields optional when `@IsOptional` is present.

## Graceful Degradation

All decorators return no-ops when `@nestjs/swagger` is not installed. Your application code compiles and runs without it; you only need the package to serve the UI.

`setupSwagger()` logs a warning and returns early if the package is missing.

## Best Practices

- Keep `enabled: false` in production to avoid exposing internal API structure.
- Use `@ApiTag` on every controller for clean sidebar grouping.
- Combine `@ApiPaginated` with `@ApiErrorResponses` on list endpoints for complete docs.
- Prefer `@AutoApiProperties` over manual `@ApiProperty` to keep DTOs DRY.
- Add `servers` entries for staging/production URLs so testers can switch environments in the UI.
