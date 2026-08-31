import { TokenStore } from './token-store.interface';

/**
 * RedisTokenStore — Redis-backed refresh token family tracking.
 *
 * Key patterns:
 * - `boot:token:{tokenId}` — token data (hash: familyId, userId, used)
 * - `boot:token:family:{familyId}` — revoked flag
 * - `boot:token:user:{userId}` — set of familyIds for bulk revocation
 *
 * Requires `ioredis` as a peer dependency.
 */
export class RedisTokenStore implements TokenStore {
  private redis: any;

  constructor(private readonly redisUrlOrClient: string | any) {}

  private getRedis(): any {
    if (this.redis) return this.redis;
    if (typeof this.redisUrlOrClient === 'string') {
      let Redis: any;
      try {
        Redis = require('ioredis');
      } catch {
        throw new Error('ioredis is required by RedisTokenStore. Install it: npm i ioredis');
      }
      this.redis = new Redis(this.redisUrlOrClient);
    } else {
      this.redis = this.redisUrlOrClient;
    }
    return this.redis;
  }

  private tokenKey(tokenId: string): string {
    return `boot:token:${tokenId}`;
  }

  private familyKey(familyId: string): string {
    return `boot:token:family:${familyId}`;
  }

  private userKey(userId: string): string {
    return `boot:token:user:${userId}`;
  }

  async storeToken(tokenId: string, familyId: string, userId: string, expiresAt: Date): Promise<void> {
    const redis = this.getRedis();
    const ttl = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    const key = this.tokenKey(tokenId);

    await redis.hset(key, 'familyId', familyId, 'userId', userId, 'used', '0');
    await redis.expire(key, ttl);
    await redis.sadd(this.userKey(userId), familyId);
  }

  async getToken(tokenId: string): Promise<{ familyId: string; userId: string; used: boolean } | null> {
    const redis = this.getRedis();
    const data = await redis.hgetall(this.tokenKey(tokenId));
    if (!data || !data.familyId) return null;
    return {
      familyId: data.familyId,
      userId: data.userId,
      used: data.used === '1',
    };
  }

  async markUsed(tokenId: string): Promise<void> {
    const redis = this.getRedis();
    await redis.hset(this.tokenKey(tokenId), 'used', '1');
  }

  async revokeFamily(familyId: string): Promise<void> {
    const redis = this.getRedis();
    // Mark family as revoked (30-day TTL for cleanup)
    await redis.set(this.familyKey(familyId), '1', 'EX', 30 * 24 * 3600);
  }

  async isFamilyRevoked(familyId: string): Promise<boolean> {
    const redis = this.getRedis();
    const result = await redis.get(this.familyKey(familyId));
    return result === '1';
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const redis = this.getRedis();
    const families = await redis.smembers(this.userKey(userId));
    if (families && families.length > 0) {
      const pipeline = redis.pipeline();
      for (const familyId of families) {
        pipeline.set(this.familyKey(familyId), '1', 'EX', 30 * 24 * 3600);
      }
      await pipeline.exec();
    }
  }
}
