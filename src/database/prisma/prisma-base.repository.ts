import { Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SchemaRegistry } from './schema-registry';
import {
  IRepository,
  PaginationOptions,
  PaginatedResult,
} from '../repository.interface';

export interface PrismaPaginationOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 'asc' | 'desc'>;
}

export interface PrismaPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** @deprecated Use PrismaPaginationOptions */
export type { PaginationOptions };
/** @deprecated Use PrismaPaginatedResult */
export type { PaginatedResult };

/**
 * Generic base repository for Prisma models.
 *
 * Implements {@link IRepository} so Prisma and Mongoose repos share the
 * same contract.
 *
 * **Note on `model` accessor:** The returned delegate is typed as `any`
 * because Prisma generates unique delegate types per model that cannot
 * be expressed generically without the generated client type. For
 * full type safety, subclasses can override the `model` getter:
 *
 * ```ts
 * protected get model() {
 *   return this.prisma.client.user; // fully typed PrismaClient delegate
 * }
 * ```
 *
 * @typeParam T - The entity/record type returned by queries.
 * @typeParam D - Optional Prisma model delegate type (defaults to `any`).
 */
export class PrismaBaseRepository<T, D = any> implements IRepository<T> {
  protected readonly logger: Logger;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
    protected readonly schemaRegistry?: SchemaRegistry,
  ) {
    this.logger = new Logger(`${modelName}Repository`);
  }

  /**
   * Access the underlying Prisma model delegate.
   *
   * Returns `any` because Prisma generates unique delegate types per model.
   * For full type safety, override this getter in concrete subclasses:
   *
   * ```ts
   * protected get model() {
   *   return this.prisma.client.user;
   * }
   * ```
   */
  protected get model(): D {
    return (this.prisma.client as Record<string, any>)[this.modelName] as D;
  }

  /** Get the schema this model belongs to */
  get schema(): string | undefined {
    return this.schemaRegistry?.getSchema(this.modelName);
  }

  /** Get fully qualified name (schema.table) */
  get qualifiedName(): string {
    return this.schemaRegistry?.qualifiedName(this.modelName) ?? this.modelName;
  }

  /**
   * Find a record by its primary key ID.
   */
  async findById(id: string): Promise<T | null> {
    return (this.model as any).findUnique({ where: { id } });
  }

  /**
   * Find one record matching the given where clause.
   */
  async findOne(where: Record<string, any>): Promise<T | null> {
    return (this.model as any).findFirst({ where });
  }

  /**
   * Find many records matching filter with pagination.
   * Satisfies the {@link IRepository} contract.
   */
  async findMany(
    where: Record<string, any>,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<T>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;
    const orderBy = options?.sort
      ? Object.fromEntries(
          Object.entries(options.sort).map(([k, v]) => [k, v === 1 ? 'asc' : 'desc']),
        )
      : { createdAt: 'desc' as const };

    const [data, total] = await Promise.all([
      (this.model as any).findMany({ where, skip, take: limit, orderBy }),
      (this.model as any).count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Find many records with raw Prisma options (no pagination wrapper).
   */
  async findManyRaw(
    where?: Record<string, any>,
    options?: {
      skip?: number;
      take?: number;
      orderBy?: any;
      include?: any;
    },
  ): Promise<T[]> {
    return (this.model as any).findMany({ where, ...options });
  }

  /**
   * Find records with offset pagination (Prisma-native sort format).
   */
  async findWithPagination(
    where: Record<string, any>,
    options: PrismaPaginationOptions,
  ): Promise<PrismaPaginatedResult<T>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;
    const orderBy = options.sort ?? { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      (this.model as any).findMany({ where, skip, take: limit, orderBy }),
      (this.model as any).count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Create a single record.
   */
  async create(data: Partial<T>): Promise<T> {
    return (this.model as any).create({ data });
  }

  /**
   * Create multiple records in bulk.
   *
   * Uses individual creates inside a transaction to return full records,
   * since Prisma's native `createMany` only returns a count.
   */
  async createMany(data: Partial<T>[]): Promise<T[]> {
    return (this.prisma as any).$transaction(
      data.map((item) => (this.model as any).create({ data: item })),
    ) as Promise<T[]>;
  }

  /**
   * Bulk create records (returns count only, uses Prisma's native createMany).
   */
  async createManyBulk(data: Partial<T>[]): Promise<{ count: number }> {
    return (this.model as any).createMany({ data });
  }

  /**
   * Update a record by ID. Returns null if not found.
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    try {
      return await (this.model as any).update({ where: { id }, data });
    } catch (err: any) {
      // Prisma throws P2025 when record not found
      if (err?.code === 'P2025') return null;
      throw err;
    }
  }

  /**
   * Update multiple records matching the given where clause.
   */
  async updateMany(
    where: Record<string, any>,
    data: Partial<T>,
  ): Promise<{ count: number }> {
    return (this.model as any).updateMany({ where, data });
  }

  /**
   * Delete a record by ID. Returns null if not found.
   */
  async delete(id: string): Promise<T | null> {
    try {
      return await (this.model as any).delete({ where: { id } });
    } catch (err: any) {
      if (err?.code === 'P2025') return null;
      throw err;
    }
  }

  /**
   * Delete multiple records matching the given where clause.
   */
  async deleteMany(where: Record<string, any>): Promise<{ count: number }> {
    return (this.model as any).deleteMany({ where });
  }

  /**
   * Count records matching the given where clause.
   */
  async count(where?: Record<string, any>): Promise<number> {
    return (this.model as any).count({ where });
  }

  /**
   * Check whether any record matches the given where clause.
   */
  async exists(where: Record<string, any>): Promise<boolean> {
    const count = await (this.model as any).count({ where });
    return count > 0;
  }

  /**
   * Upsert — create or update based on unique where clause.
   */
  async upsert(
    where: Record<string, any>,
    create: Partial<T>,
    update: Partial<T>,
  ): Promise<T> {
    return (this.model as any).upsert({ where, create, update });
  }

  /**
   * Run a set of operations inside a Prisma transaction.
   */
  async withTransaction<R>(fn: (tx: any) => Promise<R>): Promise<R> {
    return this.prisma.$transaction(fn);
  }
}
