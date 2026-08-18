# Tuần 6: Caching & Performance

> **Stage 2 — Intermediate | Tuần 6/8**
> Prerequisite: Tuần 5 (Authentication) hoàn thành

---

## Mục tiêu học tập

Sau bài này, bạn có thể:

1. Giải thích tại sao cache cần thiết và khi nào không nên dùng cache
2. Phân biệt 4 cache strategies và chọn đúng cho từng use case
3. Hiểu kiến trúc L1 (in-memory) + L2 (Redis) trong `MultiCacheService`
4. Giải thích Cache Stampede và implement giải pháp với `CacheStampedeGuard`
5. Implement cache invalidation bằng tag-based strategy
6. Benchmark hiệu năng trước/sau cache bằng autocannon

---

## 1. Tại sao Cache?

### 1.1 Database là bottleneck

**Analogy:** Bạn cần tra cứu một cuốn sách.

- **Không có cache:** Mỗi lần cần → đi thư viện, tìm sách trong kho (10 phút)
- **Có cache (L1):** Sách để trên bàn làm việc → lấy ngay (2 giây)
- **Có cache (L2):** Sách trong tủ phòng ngủ → nhanh hơn thư viện (30 giây)

Trong hệ thống:
- **Database query:** ~10-100ms (disk I/O + network)
- **Redis lookup:** ~0.1-1ms (in-memory + network)
- **In-memory Map:** ~0.001ms (CPU cache)

### 1.2 Khi nào cache phù hợp?

```
✅ Cache PHÙ HỢP khi:
- Dữ liệu đọc nhiều, ghi ít (product catalog, categories, settings)
- Tính toán đắt (complex aggregation, external API call)
- Dữ liệu được nhiều user cùng request (trending products, homepage)
- Chấp nhận được stale data trong khoảng thời gian ngắn

❌ Cache KHÔNG PHÙ HỢP khi:
- Dữ liệu thay đổi liên tục và phải real-time (stock price, inventory count)
- Dữ liệu per-user không share được (user cart, personal settings)
- Write-heavy workload (logging, event sourcing)
```

### 1.3 Các thuật ngữ cơ bản

| Thuật ngữ | Định nghĩa |
|-----------|------------|
| **Cache Hit** | Key có trong cache → trả về ngay |
| **Cache Miss** | Key không có → phải fetch từ DB |
| **Hit Ratio** | `hits / (hits + misses)` — mục tiêu >90% |
| **TTL (Time To Live)** | Thời gian tồn tại của key trong cache |
| **Eviction** | Xóa key khi cache đầy (LRU, LFU...) |
| **Stale** | Dữ liệu trong cache đã cũ so với DB |

---

## 2. Cache Strategies

### 2.1 Cache-Aside (Lazy Loading)

Đây là pattern phổ biến nhất. App tự quản lý cache.

```
READ:
1. App check cache
2. Hit? → Return
3. Miss? → Query DB → Store to cache → Return

WRITE:
1. Update DB
2. Invalidate cache key
```

```typescript
// Cache-Aside với getOrSet
async getProduct(id: string): Promise<Product> {
  return this.cache.getOrSet(
    `product:${id}`,
    () => this.db.findById(id),   // factory: chỉ gọi khi cache miss
    { ttl: 300 },                 // 5 phút
  )
}

async updateProduct(id: string, data: UpdateProductDto): Promise<Product> {
  const product = await this.db.update(id, data)
  await this.cache.del(`product:${id}`)   // Invalidate sau khi update
  return product
}
```

**Pros:** Simple, only cache what's needed
**Cons:** First request always slow (cold cache), potential stale data

### 2.2 Write-Through

Cache luôn được update cùng lúc với DB.

```
WRITE:
1. Update DB
2. Update cache (luôn làm cả 2)

READ: Check cache → (almost always) Hit → Return
```

```typescript
async updateProduct(id: string, data: UpdateProductDto): Promise<Product> {
  const product = await this.db.update(id, data)
  await this.cache.set(`product:${id}`, product, { ttl: 300 })  // Update cache
  return product
}
```

**Pros:** Cache always fresh, no stale reads
**Cons:** Write latency tăng (2 writes), cache có thể chứa data chưa được đọc

### 2.3 Write-Behind (Write-Back)

App ghi vào cache trước, DB được update async sau.

```
WRITE:
1. Update cache ngay → Return response
2. Background: flush to DB (batch, delayed)
```

**Pros:** Cực nhanh write latency
**Cons:** Data loss nếu crash trước khi flush, complexity cao, không phù hợp với NestJS thông thường

### 2.4 Read-Through

Cache layer tự động fetch từ DB khi miss.

Ít dùng trong NestJS (thường là behavior của specialized cache như Hibernate 2nd-level cache).

### 2.5 Khi nào dùng gì?

| Strategy | Best For |
|----------|---------|
| Cache-Aside | 90% use cases — read-heavy, simple |
| Write-Through | Data critical, stale data = problem |
| Write-Behind | High write throughput (analytics, logs) |
| Read-Through | ORM/framework level caching |

---

## 3. L1 vs L2 Cache

### 3.1 Latency comparison

```
L1 (In-memory Map):  ~0.001ms  — 100,000x nhanh hơn DB
L2 (Redis local):    ~0.1ms    — 1,000x nhanh hơn DB
L2 (Redis remote):   ~1ms      — 100x nhanh hơn DB
DB (PostgreSQL):     ~10ms     — baseline
DB (full table scan):~100ms+   — thảm họa
```

### 3.2 MultiCacheService Architecture

nestjs-boot implement L1+L2 trong `src/cache/multi-cache.service.ts`:

```
Request → MultiCacheService.get(key)
              │
              ▼
         Check L1 (Map)     ← ~0.001ms
              │
         ┌────┴────┐
      HIT │        │ MISS
         │        ▼
         │    Check L2 (Redis)  ← ~0.1-1ms
         │        │
         │   ┌────┴────┐
         │ HIT│        │ MISS
         │   │        ▼
         │   │    Return undefined
         │   │    (caller fetches from DB)
         │   │
         │   ▼
         │   Write-back to L1
         │   (if value < 1MB)
         │        │
         ▼        ▼
         Return value
```

**Size-aware routing** — key insight trong source:

```typescript
// src/cache/multi-cache.service.ts
const SIZE_THRESHOLD_BYTES = 1024 * 1024  // 1MB

async set(key: string, value: unknown, opts?: CacheSetOptions): Promise<void> {
  const size = this.estimateSize(value)

  if (size < SIZE_THRESHOLD_BYTES) {
    // Small: L1 + L2 (cả hai)
    await this.l1.set(key, value, l1Ttl)
  }
  // else: Large value (>1MB) → L2 only, skip L1 để tránh OOM

  if (this.l2) {
    await this.l2.set(key, value, l2Ttl)
  }
}
```

**L2 TTL = 2x L1 TTL** (default trong source):
```typescript
const l1Ttl = opts?.ttl ?? this.defaultTtl
const l2Ttl = opts?.l2Ttl ?? l1Ttl * 2
```

Tại sao? L2 là "cold backup" — nếu L1 miss (e.g., process restart), L2 vẫn có data sống lâu hơn.

### 3.3 Redis Data Structures — chọn đúng cấu trúc

| Structure | NestJS Use Case | Example Key |
|-----------|----------------|-------------|
| **String** | Simple value, serialized JSON | `product:123` → JSON |
| **Hash** | Partial field access | `user:123` → `{name, email, ...}` |
| **List** | Queue, recent activity | `activity:user:123` |
| **Set** | Unique membership, tags | `online_users` |
| **Sorted Set** | Leaderboard, time-ordered | `trending:score` |
| **Stream** | Event log | `order:events` |

---

## 4. Cache Invalidation — "2 Hard Problems in CS"

> "There are only two hard things in Computer Science: cache invalidation and naming things." — Phil Karlton

### 4.1 TTL-based Invalidation

Đơn giản nhất: để cache tự expire.

```typescript
await cache.set('product:123', product, { ttl: 300 })
// Sau 5 phút tự expire — không cần làm gì
```

**Vấn đề:** Stale window = TTL. Nếu product được update giây 1, và cache expire giây 300, user thấy data cũ trong 299 giây.

### 4.2 Event-based Invalidation

Xóa cache ngay khi data thay đổi.

```typescript
async updateProduct(id: string, dto: UpdateProductDto) {
  const product = await this.db.update(id, dto)
  await this.cache.del(`product:${id}`)      // Invalidate ngay
  return product
}
```

**Vấn đề:** Phải biết chính xác key nào cần xóa. Nếu có 10 loại cache cho cùng 1 product → phải del 10 keys.

### 4.3 Tag-based Invalidation — `TaggedCacheService`

```typescript
// src/cache/cache-tags.ts
// Set với tags
await taggedCache.setWithTags('product:123', product, {
  tags: ['products', 'category:electronics'],  // Gán vào 2 nhóm
  ttl: 300,
})

await taggedCache.setWithTags('product:456', product, {
  tags: ['products', 'category:fashion'],
  ttl: 300,
})

await taggedCache.setWithTags('product:list:page:1', productList, {
  tags: ['products'],  // List pages cũng gán tag 'products'
  ttl: 60,
})

// Khi cần xóa TẤT CẢ products:
await taggedCache.invalidateTag('products')
// → xóa: product:123, product:456, product:list:page:1 cùng lúc!
```

**Cơ chế bên dưới** (từ source):

```typescript
// TaggedCacheService lưu tag index:
// __tag__:products → ['product:123', 'product:456', 'product:list:page:1']
// __tag__:category:electronics → ['product:123']

async invalidateTag(tag: string): Promise<void> {
  const indexKey = `${TAG_INDEX_PREFIX}${tag}`           // '__tag__:products'
  const keys = await this.cache.get<string[]>(indexKey)  // lấy list keys
  
  await Promise.all([
    ...keys.map((k) => this.cache.del(k)),    // xóa từng key
    this.cache.del(indexKey),                  // xóa tag index
  ])
}
```

---

## 5. Cache Stampede — Thundering Herd

### 5.1 Vấn đề

```
Giả sử: product:123 expire lúc 12:00:00

12:00:00.001 — Request A: cache miss → bắt đầu query DB
12:00:00.002 — Request B: cache miss → bắt đầu query DB (!)
12:00:00.003 — Request C: cache miss → bắt đầu query DB (!!)
...
12:00:00.050 — 100 requests cùng query DB → DB overwhelmed → timeout cascade
```

Đây là **Thundering Herd Problem** — xuất hiện khi:
- Popular key expire dưới load cao
- Deploy mới → cold cache → tất cả miss cùng lúc
- Sau maintenance window

### 5.2 Giải pháp: CacheStampedeGuard

```typescript
// src/cache/cache-stampede.ts
export class CacheStampedeGuard {
  // In-process: 1 Map để track request đang chạy
  private readonly inflight = new Map<string, Promise<any>>()

  async getOrSet<T>(key: string, factory: () => Promise<T>, opts?): Promise<T> {
    // 1. Cache hit → return ngay
    const cached = await this.cache.get<T>(key)
    if (cached !== undefined) return cached

    // 2. Đã có request đang fetch cùng key trong process này → join vào
    const existing = this.inflight.get(key) as Promise<T> | undefined
    if (existing) return existing    // ← Không tạo DB query mới!

    // 3. Không có request nào đang chạy → tôi là người đầu tiên
    const inflight = this.runFactory<T>(key, factory, opts)
    this.inflight.set(key, inflight)

    try {
      return await inflight
    } finally {
      this.inflight.delete(key)    // Cleanup sau khi done
    }
  }

  private async runFactory<T>(key: string, factory: () => Promise<T>, opts?) {
    // Set distributed lock trong cache (cho multi-instance)
    await this.cache.set(`${key}:lock`, 1, { ttl: 30 })
    try {
      const value = await factory()      // CHỈ 1 lần query DB
      await this.cache.set(key, value, opts)
      return value
    } finally {
      await this.cache.del(`${key}:lock`)
    }
  }
}
```

**Kết quả:**

```
12:00:00.001 — Request A: miss → leader → query DB
12:00:00.002 — Request B: miss → join A's Promise (no DB call!)
12:00:00.003 — Request C: miss → join A's Promise (no DB call!)
...100 requests → TẤT CẢ join vào 1 Promise của A
12:00:00.200 — DB returns → cache set → tất cả 100 requests nhận kết quả
```

---

## 6. Hands-on: Setup và Benchmark

### Step 1: Setup Redis local

```bash
# Docker (nhanh nhất)
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine

# Verify
redis-cli ping
# → PONG
```

### Step 2: Setup CacheModule trong app

```typescript
// app.module.ts
import { BootCacheModule } from 'nestjs-boot'

@Module({
  imports: [
    BootCacheModule.register({
      ttl: 300,        // default TTL: 5 phút
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
})
export class AppModule {}
```

### Step 3: Implement Cache-Aside trong Service

```typescript
// products.service.ts
@Injectable()
export class ProductsService {
  constructor(
    private readonly cache: MultiCacheService,
    private readonly stampedeGuard: CacheStampedeGuard,
    @InjectModel(Product.name) private productModel: Model<Product>,
  ) {}

  async findById(id: string): Promise<Product> {
    // Option A: Simple cache-aside
    return this.cache.getOrSet(
      `product:${id}`,
      () => this.productModel.findById(id).exec(),
      { ttl: 300 },
    )
  }

  async findPopular(): Promise<Product[]> {
    // Option B: Stampede-safe (dùng cho popular keys)
    return this.stampedeGuard.getOrSet(
      'products:popular',
      async () => {
        return this.productModel
          .find({ featured: true })
          .sort({ views: -1 })
          .limit(10)
          .exec()
      },
      { ttl: 60 },
    )
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.productModel.findByIdAndUpdate(id, dto, { new: true })
    await this.cache.del(`product:${id}`)    // Invalidate
    return product
  }
}
```

### Step 4: Cache Warming on Startup

```typescript
// products.module.ts
@Module({})
export class ProductsModule implements OnModuleInit {
  constructor(
    private readonly warmer: CacheWarmer,
    private readonly productModel: Model<Product>,
  ) {}

  async onModuleInit() {
    this.warmer.register([
      {
        key: 'products:categories',
        factory: () => this.productModel.distinct('category').exec(),
        ttl: 3600,         // 1 giờ
        warmOnStart: true, // Warm ngay khi app start
      },
      {
        key: 'products:featured',
        factory: () => this.productModel.find({ featured: true }).limit(10).exec(),
        ttl: 300,
        warmOnStart: true,
      },
    ])
  }
}
```

### Step 5: Benchmark với autocannon

```bash
npm install -g autocannon

# Start app
npm run start:dev

# Benchmark WITHOUT cache (comment out cache.getOrSet)
autocannon -c 100 -d 30 http://localhost:3000/products/popular

# Benchmark WITH cache
autocannon -c 100 -d 30 http://localhost:3000/products/popular
```

**Sample output:**

```
Without cache:
  Requests/sec: 89.4
  Latency avg:  1120ms  p99: 4200ms

With cache:
  Requests/sec: 4820
  Latency avg:  20ms    p99: 45ms

Improvement: 54x throughput, 56x latency
```

---

## 7. Cache Failure — Graceful Degradation

Cache không nên làm app crash. Khi Redis down, app vẫn phải chạy (chậm hơn).

```typescript
async findById(id: string): Promise<Product> {
  try {
    const cached = await this.cache.get<Product>(`product:${id}`)
    if (cached) return cached
  } catch (cacheError) {
    // Log nhưng không throw — degrade gracefully
    this.logger.warn(`Cache read failed for product:${id}: ${cacheError.message}`)
  }

  // Fallback to DB
  const product = await this.productModel.findById(id)

  try {
    await this.cache.set(`product:${id}`, product, { ttl: 300 })
  } catch (cacheError) {
    this.logger.warn(`Cache write failed for product:${id}: ${cacheError.message}`)
    // Vẫn return product — chỉ không cached được
  }

  return product
}
```

---

## 8. Bài tập

### Bài tập 1: Cache Stats (Dễ)

Dùng `CacheStats` từ `src/cache/cache-stats.ts`:

```typescript
// Track hit/miss để monitor cache performance
const stats = new CacheStats()

// Sau mỗi get():
stats.recordHit()   // hoặc
stats.recordMiss()

// Expose endpoint
@Get('cache/stats')
getCacheStats() {
  return {
    hitRatio: stats.getHitRatio(),
    totalRequests: stats.getTotal(),
  }
}
```

### Bài tập 2: Tag-based Invalidation (Trung bình)

1. Implement `ProductsService` với `TaggedCacheService`
2. Mỗi product cached với tags: `['products', `category:${product.category}`]`
3. Khi admin update 1 category → `invalidateTag(`category:${categoryId}`)` → chỉ xóa cache của category đó, không ảnh hưởng category khác

### Bài tập 3: Cache Warming + Monitoring (Nâng cao)

1. Warm top-10 categories lúc startup
2. Re-warm mỗi 5 phút (dùng `@Cron` từ `@nestjs/schedule`)
3. Expose `/health/cache` endpoint trả về:
   - L1 key count
   - L2 (Redis) connected?
   - Hit ratio (15 phút gần nhất)
   - Last warm time

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| Cache luôn miss dù có data | Key không nhất quán (`product:${id}` vs `products:${id}`) | Log key trước khi get/set |
| Memory leak trong L1 | Không có TTL → Map grows forever | Luôn set TTL cho L1 entries |
| Stale data sau update | Quên invalidate cache sau DB write | Pattern: update DB → del cache key |
| Redis connection refused | Redis chưa start hoặc sai port | `redis-cli ping` để verify |
| JSON serialize error | Value có circular reference | Simplify object trước khi cache |
| Tag index quá lớn | 1 tag gán cho hàng triệu keys | Dùng prefix-based invalidation thay thế |

---

## Câu hỏi tự kiểm tra

1. `MultiCacheService.get()` trả về `undefined` — điều đó có nghĩa là gì? App nên làm gì tiếp theo?
2. Tại sao L2 TTL được set gấp đôi L1 TTL trong source? Điều gì xảy ra nếu L2 TTL ngắn hơn L1?
3. Thundering herd xảy ra ở in-process level (1 instance) hay multi-instance? `CacheStampedeGuard` giải quyết cả hai trường hợp bằng cơ chế gì?
4. Nếu product bị xóa khỏi DB, bạn cần làm gì với cache?
5. Khi nào bạn KHÔNG nên dùng cache? Cho ví dụ cụ thể với e-commerce app.

---

## Đọc thêm

- [Redis documentation — data types](https://redis.io/docs/manual/data-types/)
- [Caching Strategies and How to Choose the Right One](https://codeahoy.com/2017/08/11/caching-strategies-and-how-to-choose-the-right-one/)
- Source: `src/cache/multi-cache.service.ts`, `src/cache/cache-stampede.ts`, `src/cache/cache-tags.ts`, `src/cache/cache-warming.ts`
- Tests: `tests/cache/multi-cache.service.spec.ts`, `tests/cache/cache-advanced.spec.ts`
