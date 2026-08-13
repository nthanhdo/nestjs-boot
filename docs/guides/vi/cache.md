# Cache

## Tổng quan

`CacheModule` cung cấp cache đa tầng với định tuyến theo kích thước, bảo vệ stampede, invalidation theo tag, pre-warming, và thống kê hit/miss.

## Thiết lập

### Chỉ L1 (in-memory)

```ts
const app = await createApp(AppModule, {
  cache: {
    defaultTtl: 300,
  },
});
```

L1 mặc định sử dụng LRU cache trong bộ nhớ (tối đa 1000 entry).

### L1 + L2 (memory + Redis)

```ts
const app = await createApp(AppModule, {
  cache: {
    redis: { url: 'redis://localhost:6379' },
    defaultTtl: 300,
  },
});
```

Yêu cầu `ioredis` làm peer dependency. Fallback sang chỉ L1 kèm cảnh báo nếu chưa cài.

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

Yêu cầu `memjs` cho Memcached. Fallback sang LRU trong bộ nhớ nếu chưa cài.

### Tùy chọn cấu hình

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `redis.url` | `string` | — | URL Redis (phải bắt đầu bằng `redis://` hoặc `rediss://`) |
| `memcached.servers` | `string` | — | Server Memcached (ví dụ `host1:11211,host2:11211`) |
| `defaultTtl` | `number` | 300 | TTL mặc định tính bằng giây |

## MultiCacheService

Service cache chính. Được inject toàn cục qua token `CACHE_SERVICE`.

```ts
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_SERVICE } from 'nestjs-boot/cache/constants';
import { MultiCacheService } from 'nestjs-boot';

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_SERVICE) private readonly cache: MultiCacheService) {}
}
```

### API

| Method | Signature | Mô tả |
|--------|-----------|-------------|
| `get` | `get<T>(key): Promise<T \| undefined>` | Lấy từ L1, sau đó L2. Hit L2 sẽ ghi ngược vào L1 |
| `set` | `set(key, value, opts?): Promise<void>` | Set theo kích thước (xem bên dưới) |
| `del` | `del(key): Promise<void>` | Xóa khỏi tất cả tầng |
| `delByPrefix` | `delByPrefix(prefix): Promise<void>` | Xóa tất cả key khớp prefix khỏi tất cả tầng |
| `getOrSet` | `getOrSet<T>(key, factory, opts?): Promise<T>` | Cache-aside: lấy hoặc gọi factory rồi cache kết quả |
| `has` | `has(key): Promise<boolean>` | Kiểm tra key có tồn tại ở bất kỳ tầng nào |

### Định tuyến theo kích thước

Giá trị dưới 1MB được lưu ở cả L1 và L2. Giá trị từ 1MB trở lên chỉ lưu ở L2 để tránh áp lực bộ nhớ trên tiến trình ứng dụng.

### CacheSetOptions

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `ttl` | `number` | `defaultTtl` | TTL L1 tính bằng giây |
| `l2Ttl` | `number` | `2 * ttl` | TTL L2 tính bằng giây |

TTL L2 mặc định gấp đôi TTL L1. Nghĩa là L1 hết hạn trước, và lần đọc tiếp theo giá trị được tìm thấy ở L2 và ghi ngược vào L1 — tránh truy vấn database.

### Pattern cache-aside

```ts
const product = await this.cache.getOrSet(
  `product:${id}`,
  () => this.productModel.findById(id).exec(),
  { ttl: 600 },
);
```

## Interface CacheAdapter

Tất cả tầng cache implement interface này:

```ts
interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
  has(key: string): Promise<boolean>;
}
```

Các adapter tích hợp: `MemoryCacheAdapter`, `RedisCacheAdapter`, `MemcachedCacheAdapter`.

## CacheStampedeGuard

Ngăn chặn vấn đề thundering herd. Khi cache key hết hạn dưới tải cao, chỉ một request fetch từ nguồn — tất cả request khác chờ và chia sẻ kết quả.

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

Bảo vệ hai tầng:
1. **Gộp Promise trong tiến trình** — các caller đồng thời trong cùng tiến trình chia sẻ một Promise duy nhất (không có overhead polling).
2. **Distributed lock** — phối hợp giữa nhiều NestJS instance dùng chung Redis L2 cache. Lock TTL: 30 giây.

## CacheWarmer

Nạp trước cache khi khởi động hoặc theo yêu cầu. Loại bỏ độ trễ cold-start cho dữ liệu quan trọng.

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

| Option | Type | Default | Mô tả |
|--------|------|---------|-------------|
| `key` | `string` | — | Cache key |
| `factory` | `() => Promise<T>` | — | Hàm tạo giá trị |
| `ttl` | `number` | TTL mặc định | TTL tính bằng giây |
| `warmOnStart` | `boolean` | `false` | Nạp khi module init |
| `cron` | `string` | — | Biểu thức cron (để tham khảo; caller tự kết nối trigger) |

### API

| Method | Mô tả |
|--------|-------------|
| `register(entries)` | Đăng ký các entry cần nạp |
| `warmAll()` | Nạp tất cả entry đã đăng ký |
| `warmKey(key)` | Nạp một entry theo key |
| `getEntries()` | Trả về tất cả entry đã đăng ký |

Nạp khi khởi động dùng `Promise.allSettled` — một entry lỗi không chặn các entry khác.

## TaggedCacheService

Invalidation cache theo tag. Liên kết cache entry với tag, sau đó invalidate tất cả entry của một tag trong một lần gọi.

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

| Method | Signature | Mô tả |
|--------|-----------|-------------|
| `get` | `get<T>(key): Promise<T \| undefined>` | Lấy giá trị (proxy đến MultiCacheService) |
| `setWithTags` | `setWithTags(key, value, opts?): Promise<void>` | Set giá trị kèm liên kết tag |
| `del` | `del(key): Promise<void>` | Xóa một key |
| `invalidateTag` | `invalidateTag(tag): Promise<void>` | Xóa tất cả key liên kết với tag |
| `getTagKeys` | `getTagKeys(tag): Promise<string[]>` | Liệt kê key đăng ký dưới tag |

Tag index được lưu trong cache với prefix `__tag__:` và TTL 24 giờ. Chúng tự động dọn dẹp khi invalidate.

## CacheStats

Theo dõi tỷ lệ hit, miss, hot key, và ước tính bộ nhớ sử dụng.

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

| Method | Signature | Mô tả |
|--------|-----------|-------------|
| `recordHit` | `recordHit(key): void` | Ghi nhận cache hit |
| `recordMiss` | `recordMiss(key): void` | Ghi nhận cache miss |
| `recordSet` | `recordSet(key, bytes): void` | Ghi nhận thao tác set kèm kích thước |
| `getHitRate` | `getHitRate(prefix?): number` | Tỷ lệ hit (0.0-1.0), có thể lọc theo prefix |
| `getStats` | `getStats(): CacheStatsResult` | Ảnh chụp thống kê đầy đủ |
| `reset` | `reset(): void` | Xóa tất cả bộ đếm |

`CacheStats` được cung cấp dưới dạng injectable độc lập. Kết nối `recordHit`/`recordMiss` vào tầng truy cập cache để bắt đầu thu thập dữ liệu.

## Best Practices

- **Luôn cấu hình L2 Redis trong production** — L1 memory cache là per-process. Nhiều instance cần L2 chung để đảm bảo tính nhất quán.
- **Dùng CacheStampedeGuard cho hot key** — key nào nhận lưu lượng burst khi hết hạn nên dùng stampede guard thay vì `getOrSet` thô.
- **Nạp trước dữ liệu quan trọng khi khởi động** — categories, settings, feature flag. Dùng `CacheWarmer` với `warmOnStart: true`.
- **Dùng tag cho dữ liệu liên quan** — khi category thay đổi, invalidate `category:electronics` thay vì theo dõi từng product key.
- **Giám sát tỷ lệ hit** — tỷ lệ hit dưới 0.5 cho một key pattern nghĩa là TTL quá ngắn hoặc dữ liệu thay đổi quá thường xuyên để hưởng lợi từ cache.

## Lưu ý quan trọng

- **Dung lượng L1** — LRU trong bộ nhớ mặc định chứa 1000 entry. Key có cardinality cao (ví dụ cache per-user) sẽ bị evict thường xuyên. Dùng Memcached L1 hoặc dựa vào L2 Redis cho trường hợp này.
- **TTL L2 bất ngờ** — TTL L2 mặc định bằng `2 * TTL L1`. Đặt `l2Ttl` rõ ràng nếu bạn cần hành vi khác.
- **Tag index phình to** — tag index có TTL 24 giờ. Nếu bạn set hàng nghìn key với cùng tag mà không gọi `invalidateTag`, mảng index sẽ phình to. Gọi `invalidateTag` định kỳ.
- **CacheStats là opt-in** — `CacheStats` không tự động theo dõi hit/miss. Bạn phải gọi `recordHit`/`recordMiss` trong code. Đây là công cụ đo lường, không phải middleware.
- **Memcached không có memjs** — cấu hình `memcached.servers` mà không cài `memjs` sẽ fallback sang LRU trong bộ nhớ im lặng (kèm log cảnh báo).
