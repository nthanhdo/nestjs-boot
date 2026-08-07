import { Model, Document, FilterQuery, UpdateQuery } from 'mongoose';

/**
 * Paginated result for CrudService queries.
 */
export interface CrudPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Options for list/findAll queries.
 */
export interface CrudFindAllOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
  select?: string | Record<string, 1 | 0>;
  populate?: string | string[];
}

/**
 * CrudService<T> — abstract service with full CRUD + lifecycle hooks.
 *
 * Different from BaseRepository:
 * - BaseRepository = data-access layer (reader/writer split, raw queries)
 * - CrudService = service layer (business logic hooks, validation, events)
 *
 * Users extend this class and override hooks for custom business logic:
 *
 * ```ts
 * class ProductService extends CrudService<ProductDocument> {
 *   constructor(@InjectModel('Product') model: Model<ProductDocument>) {
 *     super(model);
 *   }
 *
 *   protected async beforeCreate(data: Partial<ProductDocument>) {
 *     data.slug = slugify(data.name);
 *     return data;
 *   }
 *
 *   protected async afterCreate(doc: ProductDocument) {
 *     await this.eventBus.emit('product.created', { id: doc._id });
 *   }
 * }
 * ```
 */
export abstract class CrudService<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  /**
   * Find all documents with pagination.
   */
  async findAll(
    filter: FilterQuery<T> = {},
    options: CrudFindAllOptions = {},
  ): Promise<CrudPaginatedResult<T>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    let query: any = this.model.find(filter);

    if (options.sort) {
      query = query.sort(options.sort);
    }
    if (options.select) {
      query = query.select(options.select);
    }
    if (options.populate) {
      const pops = Array.isArray(options.populate) ? options.populate : [options.populate];
      for (const p of pops) {
        query = query.populate(p);
      }
    }

    const [data, total] = await Promise.all([
      query.skip(skip).limit(limit).exec() as Promise<T[]>,
      this.model.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Find a document by ID.
   */
  async findById(id: string): Promise<T | null> {
    return this.model.findById(id).exec();
  }

  /**
   * Find a single document by filter.
   */
  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOne(filter).exec();
  }

  /**
   * Create a new document. Calls beforeCreate/afterCreate hooks.
   */
  async create(data: Partial<T>): Promise<T> {
    const prepared = await this.beforeCreate({ ...data });
    const doc = await this.model.create(prepared);
    await this.afterCreate(doc);
    return doc;
  }

  /**
   * Update a document by ID. Calls beforeUpdate/afterUpdate hooks.
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    const prepared = await this.beforeUpdate(id, { ...data });
    const doc = await this.model
      .findByIdAndUpdate(id, prepared as UpdateQuery<T>, { new: true })
      .exec();
    if (doc) {
      await this.afterUpdate(doc);
    }
    return doc;
  }

  /**
   * Delete a document by ID. Calls beforeDelete/afterDelete hooks.
   */
  async delete(id: string): Promise<T | null> {
    await this.beforeDelete(id);
    const doc = await this.model.findByIdAndDelete(id).exec();
    if (doc) {
      await this.afterDelete(doc);
    }
    return doc;
  }

  /**
   * Count documents matching a filter.
   */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  /**
   * Check if a document exists.
   */
  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const result = await this.model.exists(filter);
    return result !== null;
  }

  // ── Lifecycle hooks — override in subclass ──────────────────────

  /**
   * Called before creating a document. Transform or validate data.
   * Return the (possibly modified) data.
   */
  protected async beforeCreate(data: Partial<T>): Promise<Partial<T>> {
    return data;
  }

  /**
   * Called after a document is created. Emit events, update caches, etc.
   */
  protected async afterCreate(_doc: T): Promise<void> {
    // Override in subclass
  }

  /**
   * Called before updating a document. Transform or validate data.
   * Return the (possibly modified) data.
   */
  protected async beforeUpdate(_id: string, data: Partial<T>): Promise<Partial<T>> {
    return data;
  }

  /**
   * Called after a document is updated.
   */
  protected async afterUpdate(_doc: T): Promise<void> {
    // Override in subclass
  }

  /**
   * Called before deleting a document. Throw to prevent deletion.
   */
  protected async beforeDelete(_id: string): Promise<void> {
    // Override in subclass
  }

  /**
   * Called after a document is deleted.
   */
  protected async afterDelete(_doc: T): Promise<void> {
    // Override in subclass
  }
}
