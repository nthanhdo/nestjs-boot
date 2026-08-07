import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiCacheService } from '../../src/cache/multi-cache.service';
import { MemoryCacheAdapter } from '../../src/cache/adapters/memory-cache.adapter';
import { CacheStampedeGuard } from '../../src/cache/cache-stampede';
import { CacheWarmer } from '../../src/cache/cache-warming';
import { TaggedCacheService } from '../../src/cache/cache-tags';
import { CacheStats } from '../../src/cache/cache-stats';

function makeService(): MultiCacheService {
  const l1 = new MemoryCacheAdapter(1000);
  return new MultiCacheService(l1, null, 300);
}

// ─────────────────────────────────────────────────────────────
// CacheStampedeGuard
// ─────────────────────────────────────────────────────────────
describe('CacheStampedeGuard', () => {
  let service: MultiCacheService;
  let guard: CacheStampedeGuard;

  beforeEach(() => {
    service = makeService();
    guard = new CacheStampedeGuard(service);
  });

  // Test 1: KEY feature — only ONE factory call for concurrent requests
  it('calls factory exactly once for N concurrent requests (stampede prevention)', async () => {
    const factory = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('data'), 30)),
    );

    // Fire 10 concurrent requests for the same key
    const results = await Promise.all(
      Array.from({ length: 10 }, () => guard.getOrSet('product:stampede', factory)),
    );

    // All get the same value
    expect(results.every((r) => r === 'data')).toBe(true);
    // Factory called only ONCE — this is the core invariant
    expect(factory).toHaveBeenCalledTimes(1);
  });

  // Test 2: cache hit skips factory entirely
  it('returns cached value without calling factory on hit', async () => {
    await service.set('product:cached', 'existing');
    const factory = vi.fn();

    const result = await guard.getOrSet('product:cached', factory);

    expect(result).toBe('existing');
    expect(factory).not.toHaveBeenCalled();
  });

  // Test 3: factory error releases lock so next caller can retry
  it('releases lock when factory throws so next caller can try', async () => {
    let attempt = 0;
    const factory = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('DB down'));
      return Promise.resolve('recovered');
    });

    // First call should throw
    await expect(guard.getOrSet('product:error', factory)).rejects.toThrow('DB down');

    // Lock must be released — second call should succeed
    const result = await guard.getOrSet('product:error', factory);
    expect(result).toBe('recovered');
  });
});

// ─────────────────────────────────────────────────────────────
// CacheWarmer
// ─────────────────────────────────────────────────────────────
describe('CacheWarmer', () => {
  let service: MultiCacheService;
  let warmer: CacheWarmer;

  beforeEach(() => {
    service = makeService();
    warmer = new CacheWarmer(service);
  });

  // Test 4: warmOnStart entries are populated on module init
  it('populates cache on module init for warmOnStart=true entries', async () => {
    warmer.register([
      { key: 'categories', factory: async () => ['toys', 'books'], warmOnStart: true, ttl: 3600 },
      { key: 'settings', factory: async () => ({ theme: 'dark' }), warmOnStart: false },
    ]);

    await warmer.onModuleInit();

    const categories = await service.get('categories');
    expect(categories).toEqual(['toys', 'books']);

    // warmOnStart: false entry should NOT be warm yet
    const settings = await service.get('settings');
    expect(settings).toBeUndefined();
  });

  // Test 5: warmKey warms a specific key on demand
  it('warms a specific key via warmKey()', async () => {
    warmer.register([
      { key: 'config', factory: async () => ({ version: 2 }), ttl: 600 },
    ]);

    await warmer.warmKey('config');

    const config = await service.get('config');
    expect(config).toEqual({ version: 2 });
  });
});

// ─────────────────────────────────────────────────────────────
// TaggedCacheService
// ─────────────────────────────────────────────────────────────
describe('TaggedCacheService', () => {
  let service: MultiCacheService;
  let tagged: TaggedCacheService;

  beforeEach(() => {
    service = makeService();
    tagged = new TaggedCacheService(service);
  });

  // Test 6: invalidateTag clears all keys with that tag
  it('invalidates all keys associated with a tag', async () => {
    await tagged.setWithTags('product:1', { name: 'A' }, { tags: ['products', 'category:toys'] });
    await tagged.setWithTags('product:2', { name: 'B' }, { tags: ['products', 'category:books'] });
    await tagged.setWithTags('product:3', { name: 'C' }, { tags: ['category:books'] });

    // Both tagged 'products' should exist
    expect(await tagged.get('product:1')).toBeDefined();
    expect(await tagged.get('product:2')).toBeDefined();

    await tagged.invalidateTag('products');

    // product:1 and product:2 cleared; product:3 still exists
    expect(await tagged.get('product:1')).toBeUndefined();
    expect(await tagged.get('product:2')).toBeUndefined();
    expect(await tagged.get('product:3')).toBeDefined();
  });

  // Test 7: invalidateTag by sub-tag clears only that slice
  it('invalidates only the targeted tag slice', async () => {
    await tagged.setWithTags('p:electronics:1', 'e1', { tags: ['category:electronics'] });
    await tagged.setWithTags('p:toys:1', 't1', { tags: ['category:toys'] });

    await tagged.invalidateTag('category:electronics');

    expect(await tagged.get('p:electronics:1')).toBeUndefined();
    expect(await tagged.get('p:toys:1')).toBe('t1');
  });
});

// ─────────────────────────────────────────────────────────────
// CacheStats
// ─────────────────────────────────────────────────────────────
describe('CacheStats', () => {
  let stats: CacheStats;

  beforeEach(() => {
    stats = new CacheStats();
  });

  // Test 8: hit rate calculation
  it('calculates overall hit rate correctly', () => {
    stats.recordHit('user:1');
    stats.recordHit('user:1');
    stats.recordMiss('user:1');
    stats.recordHit('product:1');
    stats.recordMiss('product:1');
    stats.recordMiss('product:1');

    // 3 hits / 6 total = 0.5
    expect(stats.getHitRate()).toBeCloseTo(0.5);

    // Per pattern: user: 2/3 hits
    expect(stats.getHitRate('user:')).toBeCloseTo(2 / 3);

    // Per pattern: product: 1/3 hits
    expect(stats.getHitRate('product:')).toBeCloseTo(1 / 3);
  });

  it('returns zero hit rate when no ops recorded', () => {
    expect(stats.getHitRate()).toBe(0);
  });

  it('reset() clears all counters', () => {
    stats.recordHit('key');
    stats.recordMiss('key');
    stats.reset();

    expect(stats.getHitRate()).toBe(0);
    const result = stats.getStats();
    expect(result.totalOps).toBe(0);
  });

  it('getStats() returns hotKeys sorted by access count', () => {
    // 5 accesses for product:1, 2 for user:1
    for (let i = 0; i < 5; i++) stats.recordHit('product:1');
    stats.recordHit('user:1');
    stats.recordMiss('user:1');

    const { hotKeys } = stats.getStats();
    expect(hotKeys[0].key).toBe('product:1');
    expect(hotKeys[0].hits).toBe(5);
  });
});
