import { CacheAdapter } from '../interfaces';

interface CacheEntry {
  value: unknown;
  expiresAt: number | null; // null = no expiry
  createdAt: number;
}

/**
 * In-memory LRU cache adapter.
 * Uses a Map (insertion-order iteration) for simple LRU eviction.
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // Check TTL expiry
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Move to end (most recently used) by re-inserting
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value as T;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    // If key exists, delete first to reset insertion order
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // Evict oldest entry if at capacity
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : null,
      createdAt: Date.now(),
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    const keysToDelete: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.store.delete(key);
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }
}
