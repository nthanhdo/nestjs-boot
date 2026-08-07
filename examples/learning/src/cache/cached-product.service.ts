// ============================================================
// LESSON 10: Cache-Aside Pattern
// ============================================================
//
// This file shows the "cache-aside" (or "lazy loading") pattern:
//   1. Check cache first
//   2. If found (HIT) -> return cached value (fast!)
//   3. If not found (MISS) -> query database, store in cache, return
//
// WHY CACHE:
//   Database query: ~50ms (network + disk I/O)
//   Redis query:    ~5ms  (network + memory)
//   In-memory:      ~0.1ms (no network, just RAM)
//
// nestjs-boot's MultiCacheService gives you TWO layers:
//   L1 = in-memory (fastest, per-process, lost on restart)
//   L2 = Redis (fast, shared across processes, survives restart)
//
// Read path: L1 -> L2 -> database
//   - L1 hit: return immediately (~0.1ms)
//   - L1 miss, L2 hit: return + write-back to L1 (~5ms)
//   - Both miss: query DB + populate both layers (~50ms)
//
// NESTJS-BOOT CONNECTION:
// When you configure `cache.redis` in createApp(), nestjs-boot
// creates a CACHE_SERVICE provider that you inject with
// @Inject('CACHE_SERVICE').
//
// NOTE: This is a REFERENCE file showing the cache pattern.
// The main ProductService (product.service.ts) does NOT use
// caching yet -- that's Exercise 03!
// ============================================================

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductDocument } from '../product/product.schema';

// --------------------------------------------------------
// Cache service interface
//
// nestjs-boot's CACHE_SERVICE provides these methods:
//   get<T>(key) -> T | undefined  (checks L1 then L2)
//   set(key, value, ttl?) -> void (writes to L1 + L2)
//   del(key) -> void              (deletes from both layers)
//
// TTL (Time To Live) is in seconds. After TTL expires, the
// cached value is automatically deleted.
// --------------------------------------------------------
interface CacheService {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
}

@Injectable()
export class CachedProductService {
  private readonly logger = new Logger(CachedProductService.name);

  constructor(
    @InjectModel('Product')
    private readonly productModel: Model<ProductDocument>,

    // Inject nestjs-boot's multi-layer cache service
    @Inject('CACHE_SERVICE')
    private readonly cache: CacheService,
  ) {}

  // --------------------------------------------------------
  // CACHE-ASIDE: Find one product
  //
  // This demonstrates the full cache-aside pattern:
  //   1. Build a cache key (must be unique per resource)
  //   2. Try to get from cache
  //   3. If found -> return (cache HIT)
  //   4. If not found -> query DB, store in cache, return (cache MISS)
  //
  // CACHE KEY CONVENTION:
  // Use a prefix + identifier: "product:abc123"
  // This makes it easy to:
  //   - Find all product keys: product:*
  //   - Invalidate a specific product: del("product:abc123")
  //   - Avoid collisions with other models
  // --------------------------------------------------------
  async findOne(id: string): Promise<ProductDocument> {
    const cacheKey = `product:${id}`;

    // Step 1: Check cache (L1 in-memory -> L2 Redis)
    const cached = await this.cache.get<ProductDocument>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT: ${cacheKey}`);
      return cached;
    }

    // Step 2: Cache MISS -- query database
    this.logger.debug(`Cache MISS: ${cacheKey}`);
    const product = await this.productModel.findById(id).exec();
    if (!product) {
      // Don't cache 404s -- the product might be created later
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    // Step 3: Populate cache for next time (TTL = 5 minutes)
    // .toObject() converts Mongoose document to plain object
    // (Mongoose documents have internal state that shouldn't be cached)
    await this.cache.set(cacheKey, product.toObject(), 300);

    return product;
  }

  // --------------------------------------------------------
  // CACHE INVALIDATION: The hardest problem in CS
  //
  // When data changes (create, update, delete), you MUST
  // invalidate the cache. Otherwise, stale data is served.
  //
  // Strategies:
  //   1. Delete on write (simplest -- used here)
  //      Pro: Simple, always correct
  //      Con: Next read is a cache miss (slower)
  //
  //   2. Update on write (write-through)
  //      Pro: Cache always warm
  //      Con: Extra write even if nobody reads the data
  //
  //   3. TTL expiry only (eventual consistency)
  //      Pro: Simplest, no invalidation code
  //      Con: Stale data for up to TTL seconds
  // --------------------------------------------------------
  async update(id: string, data: Partial<ProductDocument>): Promise<ProductDocument> {
    const product = await this.productModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    // Invalidate cache -- delete the stale entry
    // The next findOne() call will re-populate from DB
    await this.cache.del(`product:${id}`);
    this.logger.debug(`Cache INVALIDATED: product:${id}`);

    return product;
  }

  async remove(id: string): Promise<void> {
    const result = await this.productModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    // Invalidate cache
    await this.cache.del(`product:${id}`);
    this.logger.debug(`Cache INVALIDATED: product:${id}`);
  }
}

// ============================================================
// WHAT'S HAPPENING UNDER THE HOOD:
//
// nestjs-boot's MultiCacheService (behind CACHE_SERVICE):
//
// get(key):
//   1. Check L1 (MemoryCacheAdapter -- LRU cache in process memory)
//   2. If L1 hit -> return immediately
//   3. Check L2 (RedisCacheAdapter -- Redis server)
//   4. If L2 hit -> write-back to L1 (for next time) + return
//   5. Both miss -> return undefined
//
// set(key, value, ttl):
//   1. If value < 1MB -> write to L1 AND L2
//   2. If value >= 1MB -> write to L2 only (don't bloat memory)
//   3. TTL applied to both layers independently
//
// del(key):
//   1. Delete from L1
//   2. Delete from L2
//
// The L1 + L2 architecture means:
//   - Hot data stays in process memory (microsecond access)
//   - All instances share L2 (Redis), so cache is consistent
//   - Large objects go to Redis only (won't OOM your process)
//
// Congratulations! You've completed all 10 source code lessons.
// Now try the exercises in the exercises/ directory.
// ============================================================
