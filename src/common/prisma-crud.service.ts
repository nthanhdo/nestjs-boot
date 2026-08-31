import { Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';

/**
 * Paginated result for PrismaCrudService queries.
 */
export interface PrismaCrudPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Options for list/findAll queries.
 */
export interface PrismaCrudFindAllOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 'asc' | 'desc'>;
  select?: Record<string, boolean>;
  include?: Record<string, boolean | object>;
}

/**
 * PrismaCrudService<T> — abstract service with full CRUD + lifecycle hooks for Prisma.
 *
 * Mirrors the CrudService (Mongoose) API but works with Prisma models.
 *
 * Different from PrismaBaseRepository:
 * - PrismaBaseRepository = data-access layer (raw queries, no hooks)
 * - PrismaCrudService = service layer (business logic hooks, validation, events)
 *
 * Users extend this class and override hooks for custom business logic:
 *
 * ```ts
 * class ProductService extends PrismaCrudService<Product> {
 *   constructor(prisma: PrismaService) {
 *     super(prisma, 'product');
 *   }
 *
 *   protected async beforeCreate(data: Partial<Product>) {
 *     data.slug = slugify(data.name!);
 *     return data;
 *   }
 *
 *   protected async afterCreate(doc: Product) {
 *     await this.eventBus.emit('product.created', { id: doc.id });
 *   }
 * }
 * ```
 */
export abstract class PrismaCrudService<T> {
  protected readonly logger: Logger;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
  ) {
    this.logger = new Logger(`${modelName}CrudService`);
  }

  /**
   * Access the Prisma delegate for this model.
   */
  protected get model() {
    return (this.prisma.client as any)[this.modelName];
  }

  /**
   * Find all records with pagination.
   */
  async findAll(
    filter: Record<string, any> = {},
    options: PrismaCrudFindAllOptions = {},
  ): Promise<PrismaCrudPaginatedResult<T>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const queryOptions: Record<string, any> = {
      where: filter,
      skip,
      take: limit,
    };

    if (options.sort) {
      queryOptions.orderBy = options.sort;
    }
    if (options.select) {
      queryOptions.select = options.select;
    }
    if (options.include) {
      queryOptions.include = options.include;
    }

    const [data, total] = await Promise.all([
      this.model.findMany(queryOptions) as Promise<T[]>,
      this.model.count({ where: filter }) as Promise<number>,
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Find a record by ID.
   */
  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  /**
   * Find a single record by filter.
   */
  async findOne(filter: Record<string, any>): Promise<T | null> {
    return this.model.findFirst({ where: filter });
  }

  /**
   * Create a new record. Calls beforeCreate/afterCreate hooks.
   */
  async create(data: Partial<T>): Promise<T> {
    const prepared = await this.beforeCreate({ ...data });
    const doc = await this.model.create({ data: prepared });
    await this.afterCreate(doc);
    return doc;
  }

  /**
   * Update a record by ID. Calls beforeUpdate/afterUpdate hooks.
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    const prepared = await this.beforeUpdate(id, { ...data });
    try {
      const doc = await this.model.update({ where: { id }, data: prepared });
      await this.afterUpdate(doc);
      return doc;
    } catch (error: any) {
      // Prisma throws P2025 when record not found
      if (error?.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a record by ID. Calls beforeDelete/afterDelete hooks.
   */
  async delete(id: string): Promise<T | null> {
    await this.beforeDelete(id);
    try {
      const doc = await this.model.delete({ where: { id } });
      await this.afterDelete(doc);
      return doc;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Count records matching a filter.
   */
  async count(filter: Record<string, any> = {}): Promise<number> {
    return this.model.count({ where: filter });
  }

  /**
   * Check if a record exists.
   */
  async exists(filter: Record<string, any>): Promise<boolean> {
    const count = await this.model.count({ where: filter });
    return count > 0;
  }

  // ── Lifecycle hooks — override in subclass ──────────────────────

  /**
   * Called before creating a record. Transform or validate data.
   * Return the (possibly modified) data.
   */
  protected async beforeCreate(data: Partial<T>): Promise<Partial<T>> {
    return data;
  }

  /**
   * Called after a record is created. Emit events, update caches, etc.
   */
  protected async afterCreate(_doc: T): Promise<void> {
    // Override in subclass
  }

  /**
   * Called before updating a record. Transform or validate data.
   * Return the (possibly modified) data.
   */
  protected async beforeUpdate(_id: string, data: Partial<T>): Promise<Partial<T>> {
    return data;
  }

  /**
   * Called after a record is updated.
   */
  protected async afterUpdate(_doc: T): Promise<void> {
    // Override in subclass
  }

  /**
   * Called before deleting a record. Throw to prevent deletion.
   */
  protected async beforeDelete(_id: string): Promise<void> {
    // Override in subclass
  }

  /**
   * Called after a record is deleted.
   */
  protected async afterDelete(_doc: T): Promise<void> {
    // Override in subclass
  }
}
