# 06 - Caching (Redis + Multi-Layer)

Caching stores frequently accessed data in fast storage to avoid slow database queries.

## nestjs-boot's Cache Architecture

```
Request -> L1 (in-memory, ~0.1ms) -> L2 (Redis, ~5ms) -> Database (~50ms)
```

- **L1**: LRU cache in process memory. Fastest but per-process (not shared).
- **L2**: Redis server. Shared across all app instances. Survives restarts.

## Configuration

In `main.ts`:

```typescript
cache: {
  redis: { url: 'redis://localhost:6379' },
  defaultTtl: 300,  // 5 minutes
},
```

## Using the Cache Service

Inject `CACHE_SERVICE` in any service:

```typescript
import { Inject } from '@nestjs/common';

constructor(
  @Inject('CACHE_SERVICE') private readonly cache: {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown, ttl?: number): Promise<void>;
    del(key: string): Promise<void>;
  },
) {}
```

## The Cache-Aside Pattern

```typescript
async findOne(id: string) {
  const cacheKey = `product:${id}`;

  // 1. Check cache
  const cached = await this.cache.get(cacheKey);
  if (cached) return cached;  // HIT

  // 2. Cache MISS -- query database
  const product = await this.productModel.findById(id).exec();

  // 3. Populate cache for next time
  await this.cache.set(cacheKey, product.toObject(), 300);

  return product;
}
```

## Cache Invalidation

When data changes, you MUST invalidate the cache:

```typescript
async update(id: string, data: any) {
  await this.productModel.findByIdAndUpdate(id, data);
  await this.cache.del(`product:${id}`);  // delete stale cache
}
```

## Why Two Layers?

| Scenario | L1 only | L2 only | L1 + L2 |
|----------|---------|---------|---------|
| Speed | Fastest | Fast | Fastest (L1 hits) |
| Shared across instances | No | Yes | Yes (via L2) |
| Survives restart | No | Yes | Yes (via L2) |
| Memory usage | In-process | External | Both |

In production with multiple app instances, L2 ensures cache consistency. L1 reduces Redis round-trips for hot data.

## Try It Yourself

See `src/cache/cached-product.service.ts` for the full implementation with detailed comments.

## Exercise

Try [Exercise 03: Add Caching](../exercises/03-add-caching.md)

---

Next: [07 - Authentication](07-authentication.md)
