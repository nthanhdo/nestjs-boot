import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemcachedCacheAdapter } from '../../src/cache/adapters/memcached-cache.adapter';

/**
 * Lightweight in-memory mock of the memjs.Client interface.
 */
class MockMemjsClient {
  private store = new Map<string, { value: Buffer; expires: number }>();

  async get(key: string): Promise<{ value: Buffer | null; flags: null }> {
    const entry = this.store.get(key);
    if (!entry) return { value: null, flags: null };

    // Check TTL expiry
    if (entry.expires > 0 && Date.now() > entry.expires) {
      this.store.delete(key);
      return { value: null, flags: null };
    }

    return { value: entry.value, flags: null };
  }

  async set(
    key: string,
    value: string | Buffer,
    options?: { expires?: number },
  ): Promise<boolean> {
    const buf = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
    const ttlSeconds = options?.expires ?? 0;
    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0;
    this.store.set(key, { value: buf, expires: expiresAt });
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  close(): void {
    this.store.clear();
  }
}

describe('MemcachedCacheAdapter', () => {
  let adapter: MemcachedCacheAdapter;
  let mockClient: MockMemjsClient;

  beforeEach(() => {
    mockClient = new MockMemjsClient();
    adapter = new MemcachedCacheAdapter(mockClient);
  });

  it('should get and set values', async () => {
    await adapter.set('key1', { hello: 'world' });
    const result = await adapter.get<{ hello: string }>('key1');
    expect(result).toEqual({ hello: 'world' });
  });

  it('should return undefined for missing keys', async () => {
    const result = await adapter.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('should delete values', async () => {
    await adapter.set('key1', 'value1');
    expect(await adapter.has('key1')).toBe(true);

    await adapter.del('key1');
    expect(await adapter.has('key1')).toBe(false);
    expect(await adapter.get('key1')).toBeUndefined();
  });

  it('should respect TTL expiry', async () => {
    // Set with 1-second TTL
    await adapter.set('ttl-key', 'value', 1);
    expect(await adapter.get('ttl-key')).toBe('value');

    // Simulate time passing by directly manipulating the mock store
    const entry = (mockClient as any).store.get('ttl-key');
    entry.expires = Date.now() - 1000; // expired 1s ago

    expect(await adapter.get('ttl-key')).toBeUndefined();
  });

  it('should report has correctly', async () => {
    expect(await adapter.has('missing')).toBe(false);

    await adapter.set('exists', 42);
    expect(await adapter.has('exists')).toBe(true);
  });

  it('should handle complex objects', async () => {
    const complex = { arr: [1, 2, 3], nested: { a: true }, str: 'hello' };
    await adapter.set('complex', complex);
    expect(await adapter.get('complex')).toEqual(complex);
  });

  it('delByPrefix should warn and be a no-op', async () => {
    await adapter.set('prefix:a', 1);
    await adapter.set('prefix:b', 2);

    // Should not throw
    await adapter.delByPrefix('prefix:');

    // Values should still exist (no-op)
    expect(await adapter.get('prefix:a')).toBe(1);
    expect(await adapter.get('prefix:b')).toBe(2);
  });
});
