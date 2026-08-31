# Cache API Reference

> Multi-layer cache (L1 in-memory LRU + optional L2 Redis/Memcached) with size-aware routing, tag invalidation, stampede protection, warming, and hit-rate statistics.

## Module Registration

```ts
CacheModule.register(options: CacheOptions): DynamicModule
```

`CacheModule` is `global: true`. Register once in your root `AppModule`.

```ts
import { CacheModule } from '@nestjs-boot/cache';

CacheModule.register({
  redis: { url: 'redis://localhost:6379' },  // optional L2
  memcached: { servers: 'localhost:11211' }, // optional L1 override
  defaultTtl: 300,
})
```

**L1 (default):** In-memory LRU (1,000-entry cap). No extra dependencies.
**L1 (optional):** Memcached — requires `memjs` installed. Falls back to LRU if `memjs` is not found.
**L2 (optional):** Redis — requires `ioredis` installed. Falls back to L1-only if `ioredis` is not found.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `redis` | `{ url: string }` | — | Redis L2 cache. URL must start with `redis://` or `rediss://` |
| `memcached` | `{ servers: string }` | — | Memcached L1 override (replaces in-memory LRU) |
| `defaultTtl` | `number` | `300` | Default TTL in seconds for all cache entries |

---

## Classes

### `MultiCacheService`

> Primary cache service — L1 → L2 read-through with size-aware writes and write-back on L2 hit.

Inject via `@InjectCache()` decorator or the `CACHE_SERVICE` token.

**Size routing:** Values serialized to ≥ 1 MB are stored in L2 only, skipping L1 to avoid memory pressure.

#### Methods

##### `get<T>(key: string): Promise<T | undefined>`

Read from L1 first, then L2. On L2 hit, writes back to L1 (write-back) if the value is under 1 MB. Returns `undefined` on a complete miss.

##### `set(key: string, value: unknown, opts?: CacheSetOptions): Promise<void>`

Write with size-aware routing. Values < 1 MB go to both L1 and L2. Values ≥ 1 MB go to L2 only.

| Param | Type | Description |
|-------|------|-------------|
| `key` | `string` | Cache key |
| `value` | `unknown` | Value to cache (must be JSON-serializable) |
| `opts.ttl` | `number` | L1 TTL in seconds (default: `defaultTtl`) |
| `opts.l2Ttl` | `number` | L2 TTL in seconds (default: `2 × ttl`) |

##### `del(key: string): Promise<void>`

Delete a key from all cache layers.

##### `delByPrefix(prefix: string): Promise<void>`

Delete all keys with the given prefix from all cache layers.

##### `getOrSet<T>(key: string, factory: () => Promise<T>, opts?: CacheSetOptions): Promise<T>`

Cache-aside pattern. Returns the cached value if present; otherwise calls `factory()`, caches the result, and returns it.

##### `has(key: string): Promise<boolean>`

Check if a key exists in any cache layer.

---

### `TaggedCacheService`

> Tag-based group invalidation on top of `MultiCacheService`.

Inject via the token `TaggedCacheService.name` (`'TaggedCacheService'`).

Maintains a `__tag__:<tag>` index in the cache that maps tags to the list of keys associated with them. Tag indexes have a fixed TTL of 24 hours.

```ts
await tagged.setWithTags('product:123', data, {
  tags: ['products', 'category:electronics'],
  ttl: 300,
});

// Invalidate all keys tagged 'products' in one call:
await tagged.invalidateTag('products');
```

#### Methods

##### `get<T>(key: string): Promise<T | undefined>`

Proxy to `MultiCacheService.get()`.

##### `setWithTags(key: string, value: unknown, opts?: TaggedCacheOptions): Promise<void>`

Store a value and register it under each provided tag.

| Param | Type | Description |
|-------|------|-------------|
| `opts.tags` | `string[]` | Tags to associate with this cache entry |
| `opts.ttl` | `number` | L1 TTL in seconds |
| `opts.l2Ttl` | `number` | L2 TTL in seconds |

##### `del(key: string): Promise<void>`

Delete a cache key. Tag indexes are not updated immediately but are harmlessly stale.

##### `invalidateTag(tag: string): Promise<void>`

Delete all keys registered under `tag` and remove the tag index itself.

##### `getTagKeys(tag: string): Promise<string[]>`

Return all keys currently registered under a tag (useful for inspection/debugging).

---

### `CacheStampedeGuard`

> Prevents thundering-herd cache stampede — only one concurrent caller fetches from origin per key.

Not registered as a NestJS provider. Instantiate directly in services that need it.

```ts
const guard = new CacheStampedeGuard(cacheService);

// Only 1 DB call fires even when 100 requests arrive simultaneously:
const product = await guard.getOrSet(
  'product:123',
  () => db.findById(id),
  { ttl: 300 },
);
```

Two-layer protection:
1. **In-process coalescing** — concurrent requests in the same process/instance share a single `Promise`. Zero polling overhead.
2. **Distributed lock** — sets a `<key>:lock` entry in the cache (TTL 30s) to coordinate across multiple service instances sharing Redis L2.

#### Methods

##### `getOrSet<T>(key: string, factory: () => Promise<T>, opts?: CacheSetOptions): Promise<T>`

Cache-aside with stampede protection. Algorithm:
1. Check cache → hit → return immediately.
2. Check in-process inflight map → join existing Promise.
3. Set distributed lock, call `factory()`, cache result, release lock.

---

### `CacheWarmer`

> Pre-populates cache on startup or on demand to eliminate cold-start latency.

Inject via the token `CacheWarmer.name` (`'CacheWarmer'`).

```ts
warmer.register([
  { key: 'categories', factory: () => db.find({}), ttl: 3600, warmOnStart: true },
  { key: 'settings',   factory: () => db.findOne({}), ttl: 600 },
]);
```

#### Methods

##### `register(entries: CacheWarmEntry[]): void`

Register warm entries. Can be called multiple times before `onModuleInit`.

##### `onModuleInit(): Promise<void>`

Called automatically by NestJS. Warms all entries where `warmOnStart: true`.

##### `warmAll(): Promise<void>`

Manually warm all registered entries regardless of `warmOnStart`.

##### `warmKey(key: string): Promise<void>`

Warm a single registered entry by key.

##### `getEntries(): readonly CacheWarmEntry[]`

Return all registered entries (useful for wiring cron-based re-warming).

---

### `CacheStats`

> Tracks hit rate, miss rate, hot keys, and estimated memory usage. Does not auto-instrument — call `recordHit` / `recordMiss` / `recordSet` manually.

Inject via `CacheStats` class token.

```ts
const value = await cache.get(key);
if (value !== undefined) stats.recordHit(key);
else stats.recordMiss(key);
```

#### Methods

##### `recordHit(key: string): void`

Record a cache hit for the given key.

##### `recordMiss(key: string): void`

Record a cache miss for the given key.

##### `recordSet(key: string, valueSizeBytes: number): void`

Record the byte size of a value being stored (for memory estimation).

##### `getHitRate(pattern?: string): number`

Get hit rate (0.0–1.0) for all keys or keys starting with `pattern`.

##### `getStats(): CacheStatsResult`

Return a full snapshot including overall hit rate, hot keys (top 20 by access count), hit rate per key prefix, and estimated memory.

##### `reset(): void`

Clear all recorded counters.

---

## Decorators

### `@InjectCache()`

Parameter decorator. Injects the `MultiCacheService` instance.

```ts
constructor(@InjectCache() private readonly cache: MultiCacheService) {}
```

---

## Interfaces

### `CacheAdapter`

```ts
interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
  has(key: string): Promise<boolean>;
}
```

Implement this interface to create custom cache adapters (e.g. Hazelcast, Aerospike).

### `CacheSetOptions`

```ts
interface CacheSetOptions {
  ttl?: number;   // L1 TTL in seconds
  l2Ttl?: number; // L2 TTL in seconds (default: 2 × ttl)
}
```

### `TaggedCacheOptions`

```ts
interface TaggedCacheOptions extends CacheSetOptions {
  tags?: string[];
}
```

### `CacheWarmEntry`

```ts
interface CacheWarmEntry<T = unknown> {
  key: string;
  factory: () => Promise<T>;
  ttl?: number;
  warmOnStart?: boolean; // default: false
  cron?: string;         // cron expression for re-warm scheduling (caller must wire trigger)
}
```

### `CacheStatsResult`

```ts
interface CacheStatsResult {
  overallHitRate: number;
  totalOps: number;
  totalHits: number;
  totalMisses: number;
  hitRateByPattern: Record<string, number>;
  hotKeys: Array<{ key: string; hits: number; misses: number; hitRate: number }>;
  estimatedMemoryBytes: number;
}
```

---

## Constants / Tokens

| Token | Type | Description |
|-------|------|-------------|
| `CACHE_SERVICE` | `string` (`'BOOT_CACHE_SERVICE'`) | Injection token for the `MultiCacheService` instance |
| `CACHE_OPTIONS` | `string` (`'BOOT_CACHE_OPTIONS'`) | Injection token for the `CacheOptions` config object |
