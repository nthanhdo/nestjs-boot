/**
 * Swagger helper decorators for nestjs-boot.
 *
 * All decorators degrade gracefully when @nestjs/swagger is not installed —
 * they return a no-op decorator so application code doesn't need guards.
 */

function tryLoadSwagger(): Record<string, unknown> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@nestjs/swagger');
  } catch {
    return null;
  }
}

/** No-op class/method decorator used when @nestjs/swagger is absent */
const noop = (): ClassDecorator & MethodDecorator =>
  (_target: object, _key?: string | symbol, _descriptor?: PropertyDescriptor) => _descriptor as undefined;

/**
 * @ApiTag — apply a controller-level tag for Swagger grouping.
 * Shorthand for `@ApiTags('products')`.
 *
 * ```ts
 * @ApiTag('products')
 * @Controller('products')
 * export class ProductsController {}
 * ```
 */
export function ApiTag(tag: string): ClassDecorator {
  const swagger = tryLoadSwagger();
  if (!swagger) return noop() as ClassDecorator;
  return (swagger.ApiTags as (tag: string) => ClassDecorator)(tag);
}

/**
 * @ApiResponse — typed success response decorator.
 * Shorthand for `@ApiResponse({ status, type })`.
 *
 * ```ts
 * @ApiResponse(201, CreateProductDto)
 * @Post()
 * create(@Body() dto: CreateProductDto) {}
 * ```
 */
export function ApiResponse(
  status: number,
  type?: new (...args: unknown[]) => unknown,
): MethodDecorator {
  const swagger = tryLoadSwagger();
  if (!swagger) return noop() as MethodDecorator;
  return (swagger.ApiResponse as (opts: { status: number; type?: unknown }) => MethodDecorator)({ status, type });
}

/**
 * @ApiPaginated — document a paginated response.
 * Inlines the PaginatedResult<T> shape in the Swagger spec.
 *
 * ```ts
 * @ApiPaginated(ProductDto)
 * @Get()
 * findAll() {}
 * ```
 */
export function ApiPaginated(itemType: new (...args: unknown[]) => unknown): MethodDecorator {
  const swagger = tryLoadSwagger();
  if (!swagger) return noop() as MethodDecorator;

  const { ApiExtraModels, ApiOkResponse, getSchemaPath } = swagger as Record<string, (...args: unknown[]) => MethodDecorator>;
  // Compose: @ApiExtraModels + @ApiOkResponse with inline paginated shape
  return (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
    ApiExtraModels(itemType)(target, key, descriptor);
    (ApiOkResponse as unknown as (opts: Record<string, unknown>) => MethodDecorator)({
      schema: {
        properties: {
          data: {
            type: 'array',
            items: { $ref: (getSchemaPath as unknown as (t: unknown) => string)(itemType) },
          },
          total: { type: 'number', example: 100 },
          page: { type: 'number', example: 1 },
          limit: { type: 'number', example: 20 },
          hasNext: { type: 'boolean', example: true },
        },
        required: ['data', 'total', 'page', 'limit', 'hasNext'],
      },
    })(target, key, descriptor);
    return descriptor;
  };
}

/**
 * @ApiErrorResponses — add standard error response documentation.
 * Attaches 400, 401, 403, 404, and 500 response schemas.
 *
 * ```ts
 * @ApiErrorResponses()
 * @Get(':id')
 * findOne(@Param('id') id: string) {}
 * ```
 */
export function ApiErrorResponses(): MethodDecorator {
  const swagger = tryLoadSwagger();
  if (!swagger) return noop() as MethodDecorator;

  const { ApiResponse: NestApiResponse } = swagger as Record<string, (opts: Record<string, unknown>) => MethodDecorator>;
  const errorShape = (description: string) => ({
    schema: {
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
    description,
  });

  return (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
    NestApiResponse({ status: 400, ...errorShape('Bad Request') })(target, key, descriptor);
    NestApiResponse({ status: 401, ...errorShape('Unauthorized') })(target, key, descriptor);
    NestApiResponse({ status: 403, ...errorShape('Forbidden') })(target, key, descriptor);
    NestApiResponse({ status: 404, ...errorShape('Not Found') })(target, key, descriptor);
    NestApiResponse({ status: 500, ...errorShape('Internal Server Error') })(target, key, descriptor);
    return descriptor;
  };
}
