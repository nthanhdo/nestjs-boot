import { Logger } from '@nestjs/common';
import type { Model, FilterQuery, UpdateQuery } from 'mongoose';
import { getTenantId } from './tenant-context';

/**
 * TenantAwareRepository — wraps a Mongoose model to auto-scope all operations
 * by the current tenant ID (row-isolation model).
 *
 * Every method automatically adds `{ tenantId: currentTenantId }` to:
 * - findAll / findOne → filter
 * - create → document fields
 * - update / delete → filter (scoped to tenant)
 *
 * Usage:
 * ```ts
 * @Injectable()
 * export class ProductRepository extends TenantAwareRepository<Product> {
 *   constructor(@InjectModel(Product.name) model: Model<Product>) {
 *     super(model);
 *   }
 * }
 * ```
 *
 * If no tenant context is active (e.g. a background job), the repository
 * operates without tenant filter and logs a warning. Pass `requireTenant: true`
 * to the constructor to throw instead.
 */
export class TenantAwareRepository<T> {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly model: Model<T>,
    private readonly opts: { requireTenant?: boolean } = {},
  ) {}

  // ─── Internal helpers ────────────────────────────────────────────────────

  private tenantFilter(): Record<string, string> {
    const tenantId = getTenantId();
    if (!tenantId) {
      if (this.opts.requireTenant) {
        throw new Error(
          `[TenantAwareRepository] No tenant context active — cannot perform query on ${this.model.modelName}`,
        );
      }
      this.logger.warn(
        `No tenant context active for ${this.model.modelName} — returning unscoped query (background job?)`,
      );
      return {};
    }
    return { tenantId };
  }

  private withTenant(filter: FilterQuery<T>): FilterQuery<T> {
    return { ...this.tenantFilter(), ...filter } as FilterQuery<T>;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Find all documents scoped to the current tenant.
   */
  async findAll(filter: FilterQuery<T> = {}): Promise<T[]> {
    return this.model.find(this.withTenant(filter)).lean().exec() as Promise<T[]>;
  }

  /**
   * Find a single document scoped to the current tenant.
   */
  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOne(this.withTenant(filter)).lean().exec() as Promise<T | null>;
  }

  /**
   * Find by ID — always scoped to the current tenant.
   */
  async findById(id: string): Promise<T | null> {
    return this.model
      .findOne({ _id: id, ...this.tenantFilter() } as FilterQuery<T>)
      .lean()
      .exec() as Promise<T | null>;
  }

  /**
   * Create a document — automatically injects tenantId.
   */
  async create(data: Partial<T>): Promise<T> {
    const tenantId = getTenantId();
    const doc: Record<string, unknown> = { ...data };
    if (tenantId) {
      doc.tenantId = tenantId;
    } else if (this.opts.requireTenant) {
      throw new Error(
        `[TenantAwareRepository] No tenant context active — cannot create ${this.model.modelName}`,
      );
    }
    return this.model.create(doc);
  }

  /**
   * Update documents matching the filter — scoped to the current tenant.
   */
  async updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateMany(this.withTenant(filter), update)
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Update a single document — scoped to the current tenant.
   */
  async updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: { new?: boolean },
  ): Promise<T | null> {
    return this.model
      .findOneAndUpdate(this.withTenant(filter), update, { new: true, ...options })
      .lean()
      .exec() as Promise<T | null>;
  }

  /**
   * Delete documents — scoped to the current tenant.
   */
  async deleteMany(filter: FilterQuery<T> = {}): Promise<{ deletedCount: number }> {
    const result = await this.model.deleteMany(this.withTenant(filter)).exec();
    return { deletedCount: result.deletedCount };
  }

  /**
   * Delete a single document — scoped to the current tenant.
   */
  async deleteOne(filter: FilterQuery<T>): Promise<boolean> {
    const result = await this.model.deleteOne(this.withTenant(filter)).exec();
    return result.deletedCount > 0;
  }

  /**
   * Count documents — scoped to the current tenant.
   */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(this.withTenant(filter)).exec();
  }
}
