/**
 * Unified interface for cache adapters (L1 memory, L2 Redis, etc.).
 */
export interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * Options for cache set operations with per-layer TTL control.
 */
export interface CacheSetOptions {
  /** L1 TTL in seconds */
  ttl?: number;
  /** L2 TTL in seconds (default: 2× ttl) */
  l2Ttl?: number;
}
