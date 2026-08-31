import { Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

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
export type PaginationOptions = PrismaPaginationOptions;
/** @deprecated Use PrismaPaginatedResult */
export type PaginatedResult<T> = PrismaPaginatedResult<T>;

/**
 * Generic base repository for Prisma models.
 *
 * Mirrors the API surface of BaseRepository (Mongoose) for consistent usage
 * across both MongoDB and PostgreSQL drivers.
 */
export class PrismaBaseRepository<T> {
  protected readonly logger: Logger;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
  ) {
    this.logger = new Logger(`${modelName}Repository`);
  }

  protected get model() {
    return (this.prisma.client as any)[this.modelName];
  }

  /**
   * Find a record by its primary key ID.
   */
  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  /**
   * Find one record matching the given where clause.
   */
  async findOne(where: Record<string, any>): Promise<T | null> {
    return this.model.findFirst({ where });
  }

  /**
   * Find many records matching the given where clause.
   */
  async findMany(
    where?: Record<string, any>,
    options?: {
      skip?: number;
      take?: number;
      orderBy?: any;
      include?: any;
    },
  ): Promise<T[]> {
    return this.model.findMany({ where, ...options });
  }

  /**
   * Find records with offset pagination.
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
      this.model.findMany({ where, skip, take: limit, orderBy }),
      this.model.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Create a single record.
   */
  async create(data: Partial<T>): Promise<T> {
    return this.model.create({ data });
  }

  /**
   * Create multiple records in bulk.
   */
  async createMany(data: Partial<T>[]): Promise<{ count: number }> {
    return this.model.createMany({ data });
  }

  /**
   * Update a record by ID.
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    return this.model.update({ where: { id }, data });
  }

  /**
   * Update multiple records matching the given where clause.
   */
  async updateMany(
    where: Record<string, any>,
    data: Partial<T>,
  ): Promise<{ count: number }> {
    return this.model.updateMany({ where, data });
  }

  /**
   * Delete a record by ID.
   */
  async delete(id: string): Promise<T> {
    return this.model.delete({ where: { id } });
  }

  /**
   * Delete multiple records matching the given where clause.
   */
  async deleteMany(where: Record<string, any>): Promise<{ count: number }> {
    return this.model.deleteMany({ where });
  }

  /**
   * Count records matching the given where clause.
   */
  async count(where?: Record<string, any>): Promise<number> {
    return this.model.count({ where });
  }

  /**
   * Check whether any record matches the given where clause.
   */
  async exists(where: Record<string, any>): Promise<boolean> {
    const count = await this.model.count({ where });
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
    return this.model.upsert({ where, create, update });
  }

  /**
   * Run a set of operations inside a Prisma transaction.
   */
  async withTransaction<R>(fn: (tx: any) => Promise<R>): Promise<R> {
    return this.prisma.$transaction(fn);
  }
}
