import { Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { Document } from 'mongoose';
import { CrudService, CrudFindAllOptions, CrudPaginatedResult } from './crud.service';

/**
 * CrudController<T> — OPT-IN abstract REST controller that pairs with CrudService<T>.
 *
 * Provides the five standard REST endpoints with no boilerplate.
 * Override any method to add auth guards, custom logic, or additional decorators.
 *
 * **Usage:**
 * ```ts
 * @Controller('products')
 * @ApiTags('products')
 * export class ProductController extends CrudController<ProductDocument> {
 *   constructor(private readonly productService: ProductService) {
 *     super(productService);
 *   }
 *
 *   // Override to add @Roles('admin') or custom guards
 *   @Roles('admin')
 *   @Delete(':id')
 *   override delete(@Param('id') id: string) {
 *     return super.delete(id);
 *   }
 * }
 * ```
 *
 * **When NOT to use CrudController:**
 * - GraphQL resolvers (use a resolver class instead)
 * - gRPC handlers (use @GrpcMethod controllers)
 * - When you need non-standard endpoint shapes
 * - When you have significantly different auth requirements per endpoint
 *
 * In those cases, write the controller manually — CrudService is still available
 * for the data-access layer.
 *
 * @template T — Mongoose Document type (e.g. `ProductDocument`)
 */
export abstract class CrudController<T extends Document> {
  constructor(protected readonly service: CrudService<T>) {}

  /**
   * GET / — list all documents with pagination.
   * Query params: `page` (default 1), `limit` (default 20)
   */
  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<CrudPaginatedResult<T>> {
    const opts: CrudFindAllOptions = {};
    if (page) opts.page = parseInt(page, 10);
    if (limit) opts.limit = parseInt(limit, 10);
    return this.service.findAll({}, opts);
  }

  /**
   * GET /:id — find a single document by ID.
   */
  @Get(':id')
  findById(@Param('id') id: string): Promise<T | null> {
    return this.service.findById(id);
  }

  /**
   * POST / — create a new document.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: Partial<T>): Promise<T> {
    return this.service.create(dto);
  }

  /**
   * PUT /:id — update a document by ID.
   */
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<T>): Promise<T | null> {
    return this.service.update(id, dto);
  }

  /**
   * DELETE /:id — delete a document by ID.
   */
  @Delete(':id')
  delete(@Param('id') id: string): Promise<T | null> {
    return this.service.delete(id);
  }
}
