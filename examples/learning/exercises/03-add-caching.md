# Exercise 03: Add Caching to Product Queries

**Objective:** Add cache-aside caching to `ProductService.findOne()`.

## Context

Every `findOne()` call queries MongoDB. For frequently accessed products, this is wasteful. Add caching so repeated reads are served from memory/Redis instead.

## Steps

1. **Edit `src/product/product.service.ts`:**
   - Add `@Inject('CACHE_SERVICE')` to the constructor
   - In `findOne()`, check cache before querying DB
   - On cache miss, store the result with a 5-minute TTL
   - In `update()` and `remove()`, invalidate the cache

2. **Reference:** See `src/cache/cached-product.service.ts` for the complete pattern.

## Hints

- Cache key format: `product:<id>`
- Use `.toObject()` before caching (Mongoose documents have non-serializable internal state)
- Don't cache 404s -- the product might be created later

```typescript
@Inject('CACHE_SERVICE')
private readonly cache: {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
};
```

## How to Verify

1. Create a product and note its ID
2. Call `GET /products/<id>` twice
3. Check the server logs -- first call should say "Cache MISS", second should say "Cache HIT"
4. Update the product, then GET again -- should be "Cache MISS" (invalidated)

## Solution

Stuck? See [solutions/03-solution/](../solutions/03-solution/)
