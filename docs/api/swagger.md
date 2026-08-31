# Swagger API Reference

> Auto-configure Swagger/OpenAPI UI for nestjs-boot applications with graceful no-op when `@nestjs/swagger` is absent.

## Module Registration

```ts
SwaggerModule.register(options?: SwaggerOptions): DynamicModule
```

Register the Swagger module with optional configuration. Stores options in DI so `setupSwagger()` can be called after the NestJS app instance is available.

```ts
// In your AppModule or via BootOptions.swagger
SwaggerModule.register({
  path: '/api/docs',
  title: 'My API',
  version: '2.0.0',
  auth: true,
  tags: [{ name: 'products', description: 'Product endpoints' }],
})
```

Defaults:
- `enabled`: `true` in development, `false` in production (`NODE_ENV === 'production'`)
- `path`: `'/api/docs'` (JSON spec served at `{path}-json`)
- `title`: `package.json` `name`
- `version`: `package.json` `version`
- `auth`: `true` when auth module is configured

## Functions

### `setupSwagger`

```ts
function setupSwagger(
  app: INestApplication,
  options: SwaggerOptions,
  hasAuth: boolean,
  _swagger?: any,  // override for testing only
): void
```

Wire `@nestjs/swagger` onto a live NestJS app instance. Called automatically by `createApp()`.

Behavior:
- Reads `package.json` for default title/version.
- Skips with a warning if `@nestjs/swagger` is not installed (soft optional dependency).
- When `auth` is enabled, adds Bearer + ApiKey (`x-api-key` header) security schemes.
- Exposes the JSON spec at `{path}-json`.

## Decorators

### `@ApiTag(tag)`

```ts
function ApiTag(tag: string): ClassDecorator
```

Controller-level tag for Swagger sidebar grouping. Shorthand for `@ApiTags()`.

```ts
@ApiTag('products')
@Controller('products')
export class ProductsController {}
```

---

### `@ApiResponse(status, type?)`

```ts
function ApiResponse(
  status: number,
  type?: new (...args: unknown[]) => unknown,
): MethodDecorator
```

Typed success response decorator. Shorthand for `@ApiResponse({ status, type })`.

```ts
@ApiResponse(201, CreateProductDto)
@Post()
create(@Body() dto: CreateProductDto) {}
```

---

### `@ApiPaginated(itemType)`

```ts
function ApiPaginated(itemType: new (...args: unknown[]) => unknown): MethodDecorator
```

Document a paginated response. Inlines the `PaginatedResult<T>` shape in the Swagger spec with fields: `data`, `total`, `page`, `limit`, `hasNext`.

```ts
@ApiPaginated(ProductDto)
@Get()
findAll() {}
```

---

### `@ApiErrorResponses()`

```ts
function ApiErrorResponses(): MethodDecorator
```

Attach standard error response documentation to an endpoint. Adds 400, 401, 403, 404, and 500 response schemas with `{ statusCode, message, error }` shape.

```ts
@ApiErrorResponses()
@Get(':id')
findOne(@Param('id') id: string) {}
```

---

### `@AutoApiProperties()`

```ts
function AutoApiProperties(): ClassDecorator
```

Auto-generate `@ApiProperty()` decorators from `class-validator` metadata on a DTO class. Reads `@IsString()`, `@IsNumber()`, `@IsBoolean()`, `@IsOptional()`, etc. and emits equivalent `@ApiProperty()` annotations — eliminating the need to duplicate every field with both a validator and a Swagger decorator.

Inferred type mappings:

| class-validator decorators | Swagger type |
|---|---|
| `@IsString()`, `@IsUrl()`, `@IsEmail()` | `string` |
| `@IsNumber()`, `@IsInt()` | `number` |
| `@IsBoolean()` | `boolean` |
| `@IsArray()` | `array` |

`@IsOptional()` → `required: false`.

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

Gracefully no-ops when `@nestjs/swagger` or `class-validator` are absent.

## Interfaces

### `SwaggerOptions`

```ts
interface SwaggerOptions {
  /** Enable Swagger UI. Default: true in dev, false in prod. */
  enabled?: boolean;

  /** URL path for Swagger UI. Default: '/api/docs' */
  path?: string;

  /** API title. Default: package.json name */
  title?: string;

  /** API description */
  description?: string;

  /** API version. Default: package.json version */
  version?: string;

  /** Server list shown in the Swagger UI "Servers" dropdown */
  servers?: Array<{ url: string; description?: string }>;

  /**
   * Auto-add Bearer + ApiKey security schemes.
   * Default: true when auth module is configured.
   */
  auth?: boolean;

  /** Tag groups shown in Swagger UI sidebar */
  tags?: Array<{ name: string; description?: string }>;
}
```

## Constants / Tokens

| Token | Value | Description |
|---|---|---|
| `SWAGGER_OPTIONS` | `'SWAGGER_OPTIONS'` | DI token for the resolved `SwaggerOptions` object |
