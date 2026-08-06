import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiCacheService } from '../../src/cache/multi-cache.service';
import { MemoryCacheAdapter } from '../../src/cache/adapters/memory-cache.adapter';
import { RedisCacheAdapter } from '../../src/cache/adapters/redis-cache.adapter';

// Use ioredis-mock for L2 tests
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RedisMock = require('ioredis-mock');

describe('MultiCacheService', () => {
  let l1: MemoryCacheAdapter;
  let service: MultiCacheService;

  beforeEach(() => {
    l1 = new MemoryCacheAdapter(100);
    service = new MultiCacheService(l1, null, 300);
  });

  // 1. get/set works with L1 only (no Redis)
  it('should get/set with L1 only', async () => {
    await service.set('key1', { name: 'test' });
    const result = await service.get<{ name: string }>('key1');
    expect(result).toEqual({ name: 'test' });
  });

  // 2. get returns undefined for missing key
  it('should return undefined for missing key', async () => {
    const result = await service.get('nonexistent');
    expect(result).toBeUndefined();
  });

  // 3. getOrSet calls factory on miss
  it('should call factory on cache miss', async () => {
    const factory = vi.fn().mockResolvedValue({ price: 42 });
    const result = await service.getOrSet('price:1', factory);
    expect(result).toEqual({ price: 42 });
    expect(factory).toHaveBeenCalledOnce();
  });

  // 4. getOrSet returns cached value on hit (factory NOT called)
  it('should return cached value without calling factory on hit', async () => {
    await service.set('price:2', { price: 99 });
    const factory = vi.fn().mockResolvedValue({ price: 0 });
    const result = await service.getOrSet('price:2', factory);
    expect(result).toEqual({ price: 99 });
    expect(factory).not.toHaveBeenCalled();
  });

  // 5. del removes from cache
  it('should delete a key', async () => {
    await service.set('to-delete', 'value');
    expect(await service.has('to-delete')).toBe(true);
    await service.del('to-delete');
    expect(await service.get('to-delete')).toBeUndefined();
  });

  // 6. delByPrefix removes matching keys
  it('should delete keys by prefix', async () => {
    await service.set('user:1', 'a');
    await service.set('user:2', 'b');
    await service.set('product:1', 'c');
    await service.delByPrefix('user:');
    expect(await service.get('user:1')).toBeUndefined();
    expect(await service.get('user:2')).toBeUndefined();
    expect(await service.get('product:1')).toBe('c');
  });

  // 7. TTL expiry
  it('should expire entries after TTL', async () => {
    await service.set('ttl-key', 'value', { ttl: 1 }); // 1 second
    expect(await service.get('ttl-key')).toBe('value');

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await service.get('ttl-key')).toBeUndefined();
  });

  // 8. L1 + L2 layering
  describe('with L2 (Redis mock)', () => {
    let redisClient: InstanceType<typeof RedisMock>;
    let l2: RedisCacheAdapter;
    let layeredService: MultiCacheService;

    beforeEach(() => {
      redisClient = new RedisMock();
      l2 = new RedisCacheAdapter(redisClient);
      const freshL1 = new MemoryCacheAdapter(100);
      layeredService = new MultiCacheService(freshL1, l2, 300);
    });

    it('should fall through to L2 on L1 miss and write-back to L1', async () => {
      // Set in both layers
      await layeredService.set('layered', { data: 'hello' });

      // Verify L2 has it
      const l2Value = await l2.get('layered');
      expect(l2Value).toEqual({ data: 'hello' });

      // Create a new service with fresh L1 but same L2 to simulate L1 miss
      const freshL1 = new MemoryCacheAdapter(100);
      const newService = new MultiCacheService(freshL1, l2, 300);

      // L1 miss → L2 hit → write-back
      const result = await newService.get<{ data: string }>('layered');
      expect(result).toEqual({ data: 'hello' });

      // Verify L1 now has it (write-back)
      const l1Value = await freshL1.get('layered');
      expect(l1Value).toEqual({ data: 'hello' });
    });

    it('should store large values in L2 only (size-aware routing)', async () => {
      // Create a value > 1MB
      const largeValue = 'x'.repeat(1024 * 1024 + 1);
      const freshL1 = new MemoryCacheAdapter(100);
      const sizedService = new MultiCacheService(freshL1, l2, 300);

      await sizedService.set('large-key', largeValue);

      // L1 should NOT have it (too large)
      const l1Result = await freshL1.get('large-key');
      expect(l1Result).toBeUndefined();

      // L2 should have it
      const l2Result = await l2.get<string>('large-key');
      expect(l2Result).toBe(largeValue);
    });

    it('should delete from both layers', async () => {
      await layeredService.set('both', 'val');
      await layeredService.del('both');
      expect(await l2.get('both')).toBeUndefined();
    });
  });
});
