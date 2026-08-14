import { CacheAdapter } from '../interfaces';

/**
 * Redis cache adapter using ioredis.
 * ioredis is an optional dependency — this adapter is only instantiated when redis config is provided.
 */
export class RedisCacheAdapter implements CacheAdapter {
   
  private readonly client: any;

   
  constructor(redisClient: any) {
    this.client = redisClient;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl && ttl > 0) {
      await this.client.set(key, serialized, 'EX', ttl);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Delete keys by prefix using SCAN (non-blocking, never KEYS).
   */
  async delByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys]: [string, string[]] = await this.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  /**
   * Get the underlying Redis client for lifecycle management.
   */
   
  getClient(): any {
    return this.client;
  }
}
