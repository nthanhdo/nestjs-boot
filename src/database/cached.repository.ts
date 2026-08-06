import { Document, FilterQuery, Model, PipelineStage } from 'mongoose';
import { createHash } from 'crypto';
import { BaseRepository, FindAllOptions, PaginatedResult } from './base.repository';
import { MultiCacheService } from '../cache/multi-cache.service';

/**
 * CachedBaseRepository — extends BaseRepository with automatic cache-aside.
 *
 * - Read methods check cache first (MD5-keyed by collection + method + args)
 * - Write methods invalidate cache by collection prefix
 * - Cache TTL configurable per instance
 */
export class CachedBaseRepository<T extends Document> extends BaseRepository<T> {
  private readonly cachePrefix: string;

  constructor(
    writerModel: Model<T>,
    readerModel: Model<T> | undefined,
    private readonly cacheService: MultiCacheService,
    private readonly cacheTtl: number = 300,
  ) {
    super(writerModel, readerModel);
    this.cachePrefix = writerModel.collection.collectionName;
  }

  /**
   * Generate cache key from collection name + method + args.
   */
  private cacheKey(method: string, ...args: unknown[]): string {
    const hash = createHash('md5')
      .update(JSON.stringify(args))
      .digest('hex');
    return `${this.cachePrefix}:${method}:${hash}`;
  }

  /**
   * Invalidate all cache entries for this collection.
   */
  private async invalidateCache(): Promise<void> {
    await this.cacheService.delByPrefix(this.cachePrefix);
  }

  // --- Read overrides (cache-first) ---

  async findAll(
    filter: FilterQuery<T> = {},
    options: FindAllOptions = {},
  ): Promise<PaginatedResult<T>> {
    const key = this.cacheKey('findAll', filter, options);
    return this.cacheService.getOrSet(
      key,
      () => super.findAll(filter, options),
      { ttl: this.cacheTtl },
    );
  }

  async findById(id: string): Promise<T | null> {
    const key = this.cacheKey('findById', id);
    return this.cacheService.getOrSet(
      key,
      () => super.findById(id),
      { ttl: this.cacheTtl },
    );
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    const key = this.cacheKey('findOne', filter);
    return this.cacheService.getOrSet(
      key,
      () => super.findOne(filter),
      { ttl: this.cacheTtl },
    );
  }

  async count(filter: FilterQuery<T> = {}): Promise<number> {
    const key = this.cacheKey('count', filter);
    return this.cacheService.getOrSet(
      key,
      () => super.count(filter),
      { ttl: this.cacheTtl },
    );
  }

  async aggregate(pipeline: PipelineStage[]): Promise<unknown[]> {
    const key = this.cacheKey('aggregate', pipeline);
    return this.cacheService.getOrSet(
      key,
      () => super.aggregate(pipeline),
      { ttl: this.cacheTtl },
    );
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const key = this.cacheKey('exists', filter);
    return this.cacheService.getOrSet(
      key,
      () => super.exists(filter),
      { ttl: this.cacheTtl },
    );
  }

  // --- Write overrides (invalidate cache) ---

  async create(data: Partial<T>): Promise<T> {
    const result = await super.create(data);
    await this.invalidateCache();
    return result;
  }

  async createMany(data: Partial<T>[]): Promise<T[]> {
    const result = await super.createMany(data);
    await this.invalidateCache();
    return result;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const result = await super.update(id, data);
    await this.invalidateCache();
    return result;
  }

  async updateMany(
    filter: FilterQuery<T>,
    data: Partial<T>,
  ): Promise<{ modifiedCount: number }> {
    const result = await super.updateMany(filter, data);
    await this.invalidateCache();
    return result;
  }

  async delete(id: string): Promise<T | null> {
    const result = await super.delete(id);
    await this.invalidateCache();
    return result;
  }

  async deleteMany(filter: FilterQuery<T>): Promise<{ deletedCount: number }> {
    const result = await super.deleteMany(filter);
    await this.invalidateCache();
    return result;
  }
}
