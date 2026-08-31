import { SessionStore, SessionData } from './session.interfaces';

/**
 * RedisSessionStore — Redis-backed session store.
 *
 * Key pattern: `boot:session:{sessionId}`
 * Data stored as JSON string with TTL from session maxAge.
 *
 * Requires `ioredis` as a peer dependency.
 */
export class RedisSessionStore implements SessionStore {
  private redis: any;

  constructor(private readonly redisUrlOrClient: string | any) {}

  private getRedis(): any {
    if (this.redis) return this.redis;
    if (typeof this.redisUrlOrClient === 'string') {
      let Redis: any;
      try {
        Redis = require('ioredis');
      } catch {
        throw new Error('ioredis is required by RedisSessionStore. Install it: npm i ioredis');
      }
      this.redis = new Redis(this.redisUrlOrClient);
    } else {
      this.redis = this.redisUrlOrClient;
    }
    return this.redis;
  }

  private key(sessionId: string): string {
    return `boot:session:${sessionId}`;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const redis = this.getRedis();
    const raw = await redis.get(this.key(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  async set(sessionId: string, data: SessionData, maxAge?: number): Promise<void> {
    const redis = this.getRedis();
    const ttl = Math.max(1, Math.ceil((maxAge ?? 86400000) / 1000));
    await redis.set(this.key(sessionId), JSON.stringify(data), 'EX', ttl);
  }

  async destroy(sessionId: string): Promise<void> {
    const redis = this.getRedis();
    await redis.del(this.key(sessionId));
  }

  async touch(sessionId: string, maxAge?: number): Promise<void> {
    const redis = this.getRedis();
    const ttl = Math.max(1, Math.ceil((maxAge ?? 86400000) / 1000));
    await redis.expire(this.key(sessionId), ttl);
  }
}
