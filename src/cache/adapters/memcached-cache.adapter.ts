import { Logger } from '@nestjs/common';
import { CacheAdapter } from '../interfaces';

/**
 * Memcached cache adapter using memjs.
 * memjs is an optional dependency — this adapter is only instantiated when memcached config is provided.
 *
 * Limitations:
 * - delByPrefix: Memcached does not support key scanning/iteration.
 *   This implementation logs a warning and is a no-op. Use explicit key deletion instead,
 *   or consider Redis L2 for prefix-based invalidation.
 */
export class MemcachedCacheAdapter implements CacheAdapter {
  private readonly logger = new Logger('MemcachedCacheAdapter');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly client: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(memcachedClient: any) {
    this.client = memcachedClient;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const { value } = await this.client.get(key);
      if (value === null || value === undefined) return undefined;
      const raw = value instanceof Buffer ? value.toString('utf8') : String(value);
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const expires = ttl && ttl > 0 ? ttl : 0;
    await this.client.set(key, serialized, { expires });
  }

  async del(key: string): Promise<void> {
    await this.client.delete(key);
  }

  /**
   * Memcached does not support key scanning or prefix-based deletion.
   * This is a documented limitation — logs a warning and is a no-op.
   */
  async delByPrefix(prefix: string): Promise<void> {
    this.logger.warn(
      `delByPrefix("${prefix}") called on MemcachedCacheAdapter — ` +
        'memcached does not support key scanning. Use explicit key deletion or Redis for prefix-based invalidation.',
    );
  }

  async has(key: string): Promise<boolean> {
    try {
      const { value } = await this.client.get(key);
      return value !== null && value !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Get the underlying memjs client for lifecycle management.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient(): any {
    return this.client;
  }
}
