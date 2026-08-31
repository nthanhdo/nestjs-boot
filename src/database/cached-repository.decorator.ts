import { createHash } from 'crypto';
import { IRepository, PaginationOptions, PaginatedResult } from './repository.interface';
import { MultiCacheService } from '../cache/multi-cache.service';

/**
 * CachedRepository — driver-agnostic cache-aside wrapper for any IRepository<T>.
 *
 * Delegates all reads through cache (MD5-keyed by collection + method + args).
 * Invalidates all cache entries for the collection on any write.
 *
 * Works with Mongoose BaseRepository, PrismaBaseRepository, or any custom
 * IRepository implementation.
 *
 * Usage:
 * ```ts
 * const cached = new CachedRepository(myRepo, cacheService, 'users', 300);
 * const user = await cached.findById('123'); // cache-first
 * ```
 */
export class CachedRepository<T> implements IRepository<T> {
  constructor(
    private readonly inner: IRepository<T>,
    private readonly cache: MultiCacheService,
    private readonly collectionName: string,
    private readonly ttl: number = 300,
  ) {}

  private cacheKey(method: string, ...args: unknown[]): string {
    const hash = createHash('md5')
      .update(JSON.stringify(args))
      .digest('hex');
    return `${this.collectionName}:${method}:${hash}`;
  }

  private async invalidateCache(): Promise<void> {
    await this.cache.delByPrefix(this.collectionName);
  }

  // --- Read methods (cache-first) ---

  async findById(id: string): Promise<T | null> {
    const key = this.cacheKey('findById', id);
    return this.cache.getOrSet(key, () => this.inner.findById(id), { ttl: this.ttl });
  }

  async findOne(filter: Record<string, any>): Promise<T | null> {
    const key = this.cacheKey('findOne', filter);
    return this.cache.getOrSet(key, () => this.inner.findOne(filter), { ttl: this.ttl });
  }

  async findMany(filter: Record<string, any>, options?: PaginationOptions): Promise<PaginatedResult<T>> {
    const key = this.cacheKey('findMany', filter, options);
    return this.cache.getOrSet(key, () => this.inner.findMany(filter, options), { ttl: this.ttl });
  }

  async count(filter?: Record<string, any>): Promise<number> {
    const key = this.cacheKey('count', filter);
    return this.cache.getOrSet(key, () => this.inner.count(filter), { ttl: this.ttl });
  }

  async exists(filter: Record<string, any>): Promise<boolean> {
    const key = this.cacheKey('exists', filter);
    return this.cache.getOrSet(key, () => this.inner.exists(filter), { ttl: this.ttl });
  }

  // --- Write methods (delegate + invalidate) ---

  async create(data: Partial<T>): Promise<T> {
    const result = await this.inner.create(data);
    await this.invalidateCache();
    return result;
  }

  async createMany(data: Partial<T>[]): Promise<T[]> {
    const result = await this.inner.createMany(data);
    await this.invalidateCache();
    return result;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const result = await this.inner.update(id, data);
    await this.invalidateCache();
    return result;
  }

  async delete(id: string): Promise<T | null> {
    const result = await this.inner.delete(id);
    await this.invalidateCache();
    return result;
  }
}
