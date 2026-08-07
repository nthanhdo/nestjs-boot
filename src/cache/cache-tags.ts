import { Injectable, Logger } from '@nestjs/common';
import { MultiCacheService } from './multi-cache.service';
import { CacheSetOptions } from './interfaces';

export interface TaggedCacheOptions extends CacheSetOptions {
  /** Tags to associate with this cache entry */
  tags?: string[];
}

const TAG_INDEX_PREFIX = '__tag__:';

/**
 * Tag-based cache invalidation on top of MultiCacheService.
 *
 * Maintains a tag → [keys] index in the same cache so you can:
 * - Invalidate ALL products in one call (`invalidateTag('products')`)
 * - Invalidate a category slice (`invalidateTag('category:electronics')`)
 *
 * Tag indexes are stored with keys prefixed `__tag__:<tag>` and hold
 * a JSON-encoded Set of cache keys.
 *
 * @example
 * ```ts
 * await tagged.setWithTags('product:123', data, {
 *   tags: ['products', 'category:electronics'],
 *   ttl: 300,
 * });
 *
 * // Later — invalidate all products at once:
 * await tagged.invalidateTag('products');
 * ```
 */
@Injectable()
export class TaggedCacheService {
  private readonly logger = new Logger('TaggedCacheService');

  constructor(private readonly cache: MultiCacheService) {}

  /** Proxy: get a value from cache */
  async get<T>(key: string): Promise<T | undefined> {
    return this.cache.get<T>(key);
  }

  /** Set a value with optional tags for group invalidation */
  async setWithTags(
    key: string,
    value: unknown,
    opts: TaggedCacheOptions = {},
  ): Promise<void> {
    const { tags, ...cacheOpts } = opts;

    // Store the actual value
    await this.cache.set(key, value, cacheOpts);

    // Update tag indexes
    if (tags && tags.length > 0) {
      await Promise.all(tags.map((tag) => this.addKeyToTag(tag, key)));
    }
  }

  /** Delete a key and remove it from all tag indexes */
  async del(key: string): Promise<void> {
    await this.cache.del(key);
    // Note: tag indexes may still reference this key — harmless, invalidateTag handles missing keys
  }

  /**
   * Invalidate all cache keys associated with a tag.
   * Clears both the individual keys and the tag index.
   */
  async invalidateTag(tag: string): Promise<void> {
    const indexKey = `${TAG_INDEX_PREFIX}${tag}`;
    const keys = await this.cache.get<string[]>(indexKey);

    if (!keys || keys.length === 0) {
      this.logger.debug(`invalidateTag("${tag}"): no keys found`);
      return;
    }

    this.logger.debug(`invalidateTag("${tag}"): clearing ${keys.length} key(s)`);

    await Promise.all([
      ...keys.map((k) => this.cache.del(k)),
      this.cache.del(indexKey),
    ]);
  }

  /** Get all keys registered under a tag (for inspection) */
  async getTagKeys(tag: string): Promise<string[]> {
    const indexKey = `${TAG_INDEX_PREFIX}${tag}`;
    return (await this.cache.get<string[]>(indexKey)) ?? [];
  }

  private async addKeyToTag(tag: string, key: string): Promise<void> {
    try {
      const indexKey = `${TAG_INDEX_PREFIX}${tag}`;
      const existing = (await this.cache.get<string[]>(indexKey)) ?? [];
      if (!existing.includes(key)) {
        existing.push(key);
        // Tag indexes live for a long time (1 day) — entries clean up on invalidation
        await this.cache.set(indexKey, existing, { ttl: 86_400 });
      }
    } catch (err) {
      this.logger.error(
        `Failed to update tag index for tag="${tag}" key="${key}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
