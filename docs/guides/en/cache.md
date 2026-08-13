# Cache

> **TL;DR** — Configure `cache.redis` in BootOptions to get a two-layer cache (L1 in-memory + L2 Redis). Use `getOrSet` for cache-aside, `CacheStampedeGuard` for hot keys, `TaggedCacheService` for group invalidation, and `CacheWarmer` for startup pre-population.

## Overview

The `CacheModule` provides multi-layer caching with size-aware routing, stampede protection, tag-based invalidation, pre-warming, and hit/miss statistics.

## Setup

### L1 only (in-memory)

```ts
const app = await createApp(AppModule, {
  cache: {
    defaultTtl: 300,
  },
});
```

L1 uses an in-memory LRU cache (1000 entries max) by default.

### L1 + L2 (memory + Redis)

```ts
const app = await createApp(AppModule, {
  cache: {
    redis: { url: 'redis://localhost:6379' },
    defaultTtl: 300,
  },
});
```

Requires `ioredis` as a peer dependency. Falls back to L1 only with a warning if not installed.

### L1 Memcached + L2 Redis

```ts
const app = await createApp(AppModule, {
  cache: {
    memcached: { servers: 'localhost:11211' },
    redis: { url: 'redis://localhost:6379' },
    defaultTtl: 300,
  },
});
```

Requires `memjs` for Memcached. Falls back to in-memory LRU if not installed.

### Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `redis.url` | `string` | — | Redis URL (must start with `redis://` or `rediss://`) |
| `memcached.servers` | `string` | — | Memcached server(s) (e.g. `host1:11211,host2:11211`) |
| `defaultTtl` | `number` | 300 | Default TTL in seconds |

## MultiCacheService

The core cache service. Injected globally via the `CACHE_SERVICE` token.

```ts
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_SERVICE } from 'nestjs-boot/cache';
import { MultiCacheService } from 'nestjs-boot';

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_SERVICE) private readonly cache: MultiCacheService) {}
}
```

### API

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `get<T>(key): Promise<T \| undefined>` | Get from L1, then L2. L2 hit writes back to L1 |
| `set` | `set(key, value, opts?): Promise<void>` | Size-aware set (see below) |
| `del` | `del(key): Promise<void>` | Delete from all layers |
| `delByPrefix` | `delByPrefix(prefix): Promise<void>` | Delete all keys matching prefix from all layers |
| `getOrSet` | `getOrSet<T>(key, factory, opts?): Promise<T>` | Cache-aside: get or call factory and cache result |
| `has` | `has(key): Promise<boolean>` | Check if key exists in any layer |

### Size-aware routing

Values under 1MB are stored in both L1 and L2. Values 1MB or larger are stored in L2 only to avoid memory pressure on the application process.

### CacheSetOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `defaultTtl` | L1 TTL in seconds |
| `l2Ttl` | `number` | `2 * ttl` | L2 TTL in seconds |

L2 TTL defaults to double the L1 TTL. This means L1 expires first, and on the next read the value is found in L2 and written back to L1 — avoiding a database hit.

### Cache-aside pattern

```ts
const product = await this.cache.getOrSet(
  `product:${id}`,
  () => this.productModel.findById(id).exec(),
  { ttl: 600 },
);
```

## CacheAdapter interface

All cache layers implement this interface:

```ts
interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
  has(key: string): Promise<boolean>;
}
```

Built-in adapters: `MemoryCacheAdapter`, `RedisCacheAdapter`, `MemcachedCacheAdapter`.

## CacheStampedeGuard

Prevents the thundering herd problem. When a cache key expires under load, only one request fetches from the origin — all others wait and share the result.

```ts
import { CacheStampedeGuard, MultiCacheService } from 'nestjs-boot';

@Injectable()
export class ProductService {
  private readonly guard: CacheStampedeGuard;

  constructor(@Inject(CACHE_SERVICE) cache: MultiCacheService) {
    this.guard = new CacheStampedeGuard(cache);
  }

  async getProduct(id: string) {
    // 100 concurrent requests = 1 DB call
    return this.guard.getOrSet(
      `product:${id}`,
      () => this.db.findById(id),
      { ttl: 300 },
    );
  }
}
```

Two-layer protection:
1. **In-process Promise coalescing** — concurrent callers in the same process share a single Promise (zero polling overhead).
2. **Distributed lock** — coordinates across multiple NestJS instances sharing a Redis L2 cache. Lock TTL: 30 seconds.

## CacheWarmer

Pre-populate cache on startup or on demand. Eliminates cold-start latency for critical data.

```ts
import { CacheWarmer } from 'nestjs-boot';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    @Inject(CacheWarmer.name) private readonly warmer: CacheWarmer,
  ) {}

  onModuleInit() {
    this.warmer.register([
      {
        key: 'categories',
        factory: () => this.categoryModel.find({}).exec(),
        ttl: 3600,
        warmOnStart: true,
      },
      {
        key: 'site-settings',
        factory: () => this.settingsModel.findOne({}).exec(),
        ttl: 600,
        warmOnStart: true,
      },
    ]);
  }
}
```

### CacheWarmEntry

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `key` | `string` | — | Cache key |
| `factory` | `() => Promise<T>` | — | Function that produces the value |
| `ttl` | `number` | default TTL | TTL in seconds |
| `warmOnStart` | `boolean` | `false` | Warm on module init |
| `cron` | `string` | — | Cron expression (for reference; caller wires the trigger) |

### API

| Method | Description |
|--------|-------------|
| `register(entries)` | Register entries to warm |
| `warmAll()` | Warm all registered entries |
| `warmKey(key)` | Warm a single entry by key |
| `getEntries()` | Return all registered entries |

Startup warming uses `Promise.allSettled` — one entry failing does not block others.

## TaggedCacheService

Tag-based cache invalidation. Associate cache entries with tags, then invalidate all entries for a tag in one call.

```ts
import { TaggedCacheService } from 'nestjs-boot';

@Injectable()
export class ProductService {
  constructor(
    @Inject(TaggedCacheService.name) private readonly tagged: TaggedCacheService,
  ) {}

  async cacheProduct(product: Product) {
    await this.tagged.setWithTags(`product:${product.id}`, product, {
      tags: ['products', `category:${product.category}`],
      ttl: 300,
    });
  }

  async onCategoryUpdate(category: string) {
    // Invalidate all products in this category
    await this.tagged.invalidateTag(`category:${category}`);
  }

  async onProductCatalogReset() {
    // Invalidate all products
    await this.tagged.invalidateTag('products');
  }
}
```

### API

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `get<T>(key): Promise<T \| undefined>` | Get value (proxy to MultiCacheService) |
| `setWithTags` | `setWithTags(key, value, opts?): Promise<void>` | Set value with tag associations |
| `del` | `del(key): Promise<void>` | Delete a key |
| `invalidateTag` | `invalidateTag(tag): Promise<void>` | Delete all keys associated with a tag |
| `getTagKeys` | `getTagKeys(tag): Promise<string[]>` | List keys registered under a tag |

Tag indexes are stored in cache with prefix `__tag__:` and a 24-hour TTL. They clean up automatically on invalidation.

## CacheStats

Track cache hit rate, miss rate, hot keys, and estimated memory usage.

```ts
import { CacheStats } from 'nestjs-boot';

@Injectable()
export class MonitoringService {
  constructor(private readonly stats: CacheStats) {}

  getReport() {
    const report = this.stats.getStats();
    // {
    //   overallHitRate: 0.85,
    //   totalOps: 10000,
    //   totalHits: 8500,
    //   totalMisses: 1500,
    //   hitRateByPattern: { product: 0.9, user: 0.7 },
    //   hotKeys: [{ key: 'product:123', hits: 500, misses: 20, hitRate: 0.96 }],
    //   estimatedMemoryBytes: 2048000,
    // }
    return report;
  }

  getProductHitRate() {
    return this.stats.getHitRate('product'); // prefix filter
  }
}
```

### API

| Method | Signature | Description |
|--------|-----------|-------------|
| `recordHit` | `recordHit(key): void` | Record a cache hit |
| `recordMiss` | `recordMiss(key): void` | Record a cache miss |
| `recordSet` | `recordSet(key, bytes): void` | Record a set operation with value size |
| `getHitRate` | `getHitRate(prefix?): number` | Hit rate (0.0-1.0), optionally filtered by prefix |
| `getStats` | `getStats(): CacheStatsResult` | Full statistics snapshot |
| `reset` | `reset(): void` | Clear all counters |

`CacheStats` is provided as a standalone injectable. Wire `recordHit`/`recordMiss` calls into your cache access layer to start collecting data.

## Best practices

- **Always configure L2 Redis in production** — L1 memory cache is per-process. Multiple instances need a shared L2 for consistency.
- **Use CacheStampedeGuard for hot keys** — any key that receives burst traffic on expiration should use the stampede guard instead of raw `getOrSet`.
- **Warm critical data on startup** — categories, settings, feature flags. Use `CacheWarmer` with `warmOnStart: true`.
- **Use tags for related data** — when a category changes, invalidate `category:electronics` instead of tracking individual product keys.
- **Monitor hit rates** — a hit rate below 0.5 for a key pattern means the TTL is too short or the data changes too frequently to benefit from caching.

## Common pitfalls

- **L1 capacity** — the default in-memory LRU holds 1000 entries. High-cardinality keys (e.g. per-user cache) will evict frequently. Use Memcached L1 or rely on L2 Redis for these.
- **L2 TTL surprise** — L2 TTL defaults to `2 * L1 TTL`. Set `l2Ttl` explicitly if you need different behavior.
- **Tag index growth** — tag indexes have a 24-hour TTL. If you set thousands of keys with the same tag without ever calling `invalidateTag`, the index array grows. Call `invalidateTag` periodically.
- **CacheStats is opt-in** — `CacheStats` does not automatically track hits/misses. You must call `recordHit`/`recordMiss` in your code. It is a measurement tool, not middleware.
- **Memcached without memjs** — configuring `memcached.servers` without installing `memjs` falls back to in-memory LRU silently (with a warning log).

## See also

- [Database](database.md) — `CachedBaseRepository` for automatic cache-aside on repositories
- [Observability](observability.md) — `CacheMetricsInterceptor` for Prometheus cache metrics
- [Production Checklist](production-checklist.md) — Redis persistence and eviction policy settings
