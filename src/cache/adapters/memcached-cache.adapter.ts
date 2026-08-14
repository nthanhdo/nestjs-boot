import { CacheAdapter } from '../interfaces';

/**
 * Thrown when an operation is not supported by the adapter implementation.
 */
export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedOperationError';
  }
}

/**
 * Memcached cache adapter using memjs.
 * memjs is an optional dependency — this adapter is only instantiated when memcached config is provided.
 *
 * Limitations:
 * - delByPrefix: Memcached does not support key scanning/iteration.
 *   Throws UnsupportedOperationError. Use explicit key deletion instead,
 *   or consider Redis L2 for prefix-based invalidation.
 */
export class MemcachedCacheAdapter implements CacheAdapter {
   
  private readonly client: any;

   
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
   * Throws UnsupportedOperationError so callers know the operation failed
   * rather than silently skipping invalidation.
   */
  async delByPrefix(prefix: string): Promise<void> {
    throw new UnsupportedOperationError(
      `delByPrefix("${prefix}") is not supported by Memcached — ` +
        'Memcached does not support key scanning/iteration. ' +
        'Use explicit key deletion, or switch to Redis L2 for prefix-based invalidation.',
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
   
  getClient(): any {
    return this.client;
  }
}
