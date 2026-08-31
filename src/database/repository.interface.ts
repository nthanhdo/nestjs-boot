/**
 * Shared repository interface for both Mongoose (BaseRepository) and
 * Prisma (PrismaBaseRepository) implementations.
 *
 * Consumers can program against `IRepository<T>` and swap the underlying
 * driver without changing business-layer code.
 */
export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findOne(filter: Record<string, any>): Promise<T | null>;
  findMany(filter: Record<string, any>, options?: PaginationOptions): Promise<PaginatedResult<T>>;
  create(data: Partial<T>): Promise<T>;
  createMany(data: Partial<T>[]): Promise<T[]>;
  update(id: string, data: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<T | null>;
  count(filter?: Record<string, any>): Promise<number>;
  exists(filter: Record<string, any>): Promise<boolean>;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
