import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { CacheAdapter, CacheSetOptions } from './interfaces';

/** Threshold for L1 storage — values >= 1MB go to L2 only. */
const SIZE_THRESHOLD_BYTES = 1024 * 1024; // 1MB

/**
 * Multi-layer cache service — L1 (in-memory) + optional L2 (Redis).
 *
 * Features:
 * - Read: L1 → L2 → miss (with L1 write-back on L2 hit)
 * - Write: size-aware routing (< 1MB → L1 + L2, >= 1MB → L2 only)
 * - Cache-aside: getOrSet() with factory function
 * - Prefix deletion across all layers
 */
@Injectable()
export class MultiCacheService implements OnModuleDestroy {
  constructor(
    private readonly l1: CacheAdapter,
    private readonly l2: CacheAdapter | null,
    private readonly defaultTtl: number = 300,
  ) {}

  /**
   * Get a value from cache. Checks L1 first, then L2.
   * On L2 hit, writes back to L1 for subsequent fast access.
   */
  async get<T>(key: string): Promise<T | undefined> {
    // Check L1
    const l1Value = await this.l1.get<T>(key);
    if (l1Value !== undefined) return l1Value;

    // Check L2
    if (this.l2) {
      const l2Value = await this.l2.get<T>(key);
      if (l2Value !== undefined) {
        // Write-back to L1 (only if small enough)
        const size = this.estimateSize(l2Value);
        if (size < SIZE_THRESHOLD_BYTES) {
          await this.l1.set(key, l2Value, this.defaultTtl);
        }
        return l2Value;
      }
    }

    return undefined;
  }

  /**
   * Set a value with size-aware routing.
   * - < 1MB: stored in both L1 and L2
   * - >= 1MB: stored in L2 only (avoids L1 memory pressure)
   */
  async set(key: string, value: unknown, opts?: CacheSetOptions): Promise<void> {
    const l1Ttl = opts?.ttl ?? this.defaultTtl;
    const l2Ttl = opts?.l2Ttl ?? l1Ttl * 2;
    const size = this.estimateSize(value);

    if (size < SIZE_THRESHOLD_BYTES) {
      // Small value → both layers
      await this.l1.set(key, value, l1Ttl);
    }
    // else: large value → L2 only (skip L1)

    if (this.l2) {
      await this.l2.set(key, value, l2Ttl);
    }
  }

  /**
   * Delete a key from all cache layers.
   */
  async del(key: string): Promise<void> {
    await this.l1.del(key);
    if (this.l2) {
      await this.l2.del(key);
    }
  }

  /**
   * Delete all keys matching a prefix from all cache layers.
   */
  async delByPrefix(prefix: string): Promise<void> {
    await this.l1.delByPrefix(prefix);
    if (this.l2) {
      await this.l2.delByPrefix(prefix);
    }
  }

  /**
   * Cache-aside pattern: get from cache, or call factory and cache the result.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    opts?: CacheSetOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = await factory();
    await this.set(key, value, opts);
    return value;
  }

  /**
   * Check if a key exists in any cache layer.
   */
  async has(key: string): Promise<boolean> {
    const l1Has = await this.l1.has(key);
    if (l1Has) return true;

    if (this.l2) {
      return this.l2.has(key);
    }

    return false;
  }

  async onModuleDestroy(): Promise<void> {
    // Redis cleanup is handled by CacheModule
  }

  /**
   * Estimate serialized byte size of a value.
   */
  private estimateSize(value: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      return 0; // If serialization fails, treat as small
    }
  }
}
