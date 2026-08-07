import { Injectable } from '@nestjs/common';

export interface CacheStatsResult {
  /** Overall hit rate across all keys (0.0 – 1.0) */
  overallHitRate: number;
  /** Total cache operations recorded */
  totalOps: number;
  /** Total hits */
  totalHits: number;
  /** Total misses */
  totalMisses: number;
  /** Hit rate per key pattern */
  hitRateByPattern: Record<string, number>;
  /** Keys sorted by total accesses (most popular first) */
  hotKeys: Array<{ key: string; hits: number; misses: number; hitRate: number }>;
  /** Estimated memory usage in bytes (based on recorded value sizes) */
  estimatedMemoryBytes: number;
}

interface KeyStats {
  hits: number;
  misses: number;
  /** Running sum of value sizes seen on set (bytes) */
  totalSizeBytes: number;
}

/**
 * Cache performance statistics.
 *
 * Tracks hit rate, miss rate, hot keys, and estimated memory usage.
 * Attach to MultiCacheService or any layer by calling recordHit/recordMiss/recordSet.
 *
 * @example
 * ```ts
 * const stats = new CacheStats();
 *
 * // After a cache.get() call:
 * const value = await cache.get(key);
 * if (value !== undefined) stats.recordHit(key);
 * else stats.recordMiss(key);
 *
 * // Get statistics:
 * const report = stats.getStats();
 * console.log('Hit rate:', report.overallHitRate); // 0.0 – 1.0
 * ```
 */
@Injectable()
export class CacheStats {
  private readonly keyStats = new Map<string, KeyStats>();

  /** Record a cache hit for a key */
  recordHit(key: string): void {
    this.getOrCreateEntry(key).hits++;
  }

  /** Record a cache miss for a key */
  recordMiss(key: string): void {
    this.getOrCreateEntry(key).misses++;
  }

  /** Record the byte size of a value being stored */
  recordSet(key: string, valueSizeBytes: number): void {
    this.getOrCreateEntry(key).totalSizeBytes += valueSizeBytes;
  }

  /**
   * Get hit rate for a specific key pattern (glob-style prefix match).
   * @param pattern optional key prefix filter — omit for overall hit rate
   */
  getHitRate(pattern?: string): number {
    let hits = 0;
    let total = 0;

    for (const [key, stats] of this.keyStats) {
      if (!pattern || key.startsWith(pattern)) {
        hits += stats.hits;
        total += stats.hits + stats.misses;
      }
    }

    return total === 0 ? 0 : hits / total;
  }

  /** Returns full stats snapshot */
  getStats(): CacheStatsResult {
    let totalHits = 0;
    let totalMisses = 0;
    let estimatedMemoryBytes = 0;

    const allKeys: Array<{
      key: string;
      hits: number;
      misses: number;
      hitRate: number;
    }> = [];

    for (const [key, stats] of this.keyStats) {
      totalHits += stats.hits;
      totalMisses += stats.misses;
      estimatedMemoryBytes += stats.totalSizeBytes;

      const ops = stats.hits + stats.misses;
      allKeys.push({
        key,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: ops === 0 ? 0 : stats.hits / ops,
      });
    }

    const totalOps = totalHits + totalMisses;
    const overallHitRate = totalOps === 0 ? 0 : totalHits / totalOps;

    // Hot keys = most accessed first
    const hotKeys = allKeys
      .sort((a, b) => b.hits + b.misses - (a.hits + a.misses))
      .slice(0, 20);

    // Hit rate by top-level prefix (e.g. 'product', 'user', 'session')
    const patternMap = new Map<string, { hits: number; ops: number }>();
    for (const k of allKeys) {
      const prefix = k.key.split(':')[0] ?? k.key;
      const existing = patternMap.get(prefix) ?? { hits: 0, ops: 0 };
      existing.hits += k.hits;
      existing.ops += k.hits + k.misses;
      patternMap.set(prefix, existing);
    }

    const hitRateByPattern: Record<string, number> = {};
    for (const [prefix, { hits, ops }] of patternMap) {
      hitRateByPattern[prefix] = ops === 0 ? 0 : hits / ops;
    }

    return {
      overallHitRate,
      totalOps,
      totalHits,
      totalMisses,
      hitRateByPattern,
      hotKeys,
      estimatedMemoryBytes,
    };
  }

  /** Reset all counters */
  reset(): void {
    this.keyStats.clear();
  }

  private getOrCreateEntry(key: string): KeyStats {
    let entry = this.keyStats.get(key);
    if (!entry) {
      entry = { hits: 0, misses: 0, totalSizeBytes: 0 };
      this.keyStats.set(key, entry);
    }
    return entry;
  }
}
