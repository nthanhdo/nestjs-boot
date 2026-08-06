import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCacheAdapter } from '../../src/cache/adapters/memory-cache.adapter';

describe('MemoryCacheAdapter', () => {
  let adapter: MemoryCacheAdapter;

  beforeEach(() => {
    adapter = new MemoryCacheAdapter(3); // small max for LRU testing
  });

  // 1. LRU eviction when max entries reached
  it('should evict oldest entry when max entries reached', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    await adapter.set('c', 3);
    // Full at 3 — adding 'd' should evict 'a'
    await adapter.set('d', 4);

    expect(await adapter.get('a')).toBeUndefined();
    expect(await adapter.get('b')).toBe(2);
    expect(await adapter.get('c')).toBe(3);
    expect(await adapter.get('d')).toBe(4);
  });

  it('should refresh LRU order on get', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    await adapter.set('c', 3);

    // Access 'a' — moves it to most recent
    await adapter.get('a');

    // Adding 'd' should evict 'b' (now oldest), not 'a'
    await adapter.set('d', 4);
    expect(await adapter.get('a')).toBe(1);
    expect(await adapter.get('b')).toBeUndefined();
  });

  // 2. TTL expiry
  it('should expire entries after TTL', async () => {
    const largeAdapter = new MemoryCacheAdapter(100);
    await largeAdapter.set('ttl', 'value', 1); // 1 second TTL
    expect(await largeAdapter.get('ttl')).toBe('value');

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await largeAdapter.get('ttl')).toBeUndefined();
  });

  it('should report has=false for expired keys', async () => {
    const largeAdapter = new MemoryCacheAdapter(100);
    await largeAdapter.set('expire-has', 'val', 1);
    expect(await largeAdapter.has('expire-has')).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await largeAdapter.has('expire-has')).toBe(false);
  });

  // 3. delByPrefix
  it('should delete keys matching a prefix', async () => {
    const largeAdapter = new MemoryCacheAdapter(100);
    await largeAdapter.set('user:1', 'a');
    await largeAdapter.set('user:2', 'b');
    await largeAdapter.set('order:1', 'c');

    await largeAdapter.delByPrefix('user:');
    expect(await largeAdapter.get('user:1')).toBeUndefined();
    expect(await largeAdapter.get('user:2')).toBeUndefined();
    expect(await largeAdapter.get('order:1')).toBe('c');
  });
});
