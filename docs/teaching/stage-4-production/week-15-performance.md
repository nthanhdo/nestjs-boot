# Tuần 15: Performance & System Design

> **Stage 4 — Production | nestjs-boot Teaching Series**
> Prerequisite: Đã hoàn thành Tuần 14 (Security)

---

## Mục tiêu học tập

Sau tuần này, sinh viên có thể:

1. Áp dụng "measure first, optimize second" — không premature optimization
2. Nhận diện và fix N+1 query problem
3. Thiết kế database indexes đúng cách và đọc query execution plan
4. Benchmark API với K6 và phân tích kết quả (RPS, p95, p99)
5. Giải thích reader/writer split pattern và khi nào dùng
6. Áp dụng RESHADED framework cho system design interviews

---

## 1. Performance Mindset

### "Measure first, optimize second"

> "Premature optimization is the root of all evil." — Donald Knuth

Đây là một trong những câu nói nổi tiếng nhất trong computer science. Ý nghĩa: **Đừng optimize trước khi biết ĐÂU là bottleneck.**

**Câu chuyện thực tế:**

Developer A thấy một vòng lặp và nghĩ "cái này có thể chậm, để tôi dùng bitmask thay vì array." Mất 2 tiếng. Sau khi benchmark, vòng lặp này chạy 0.001ms, còn database query bên cạnh chạy 800ms. Bitmask optimization = 0 tác dụng thực tế.

**Flow đúng:**
```
1. Observe: production chậm ở đâu?
2. Measure: dùng profiler/APM xác định bottleneck
3. Hypothesize: tại sao chỗ đó chậm?
4. Optimize: fix có mục tiêu
5. Verify: benchmark trước/sau để confirm
6. Repeat
```

### Công cụ đo

| Công cụ | Dùng cho |
|---------|----------|
| `clinic.js` | Profile Node.js performance (CPU, Event Loop) |
| `autocannon` | HTTP load testing (đơn giản) |
| `k6` | Load testing với scripting phức tạp |
| MongoDB Compass | Visual query profiler |
| `db.collection.explain()` | Query execution plan |
| Grafana + Prometheus | Production monitoring |

---

## 2. N+1 Query Problem

### 2.1 Vấn đề là gì?

N+1 là một trong những performance bugs phổ biến nhất — dễ viết, khó phát hiện, ảnh hưởng lớn.

**Scenario:** Lấy danh sách 100 bài posts, mỗi post cần kèm thông tin author.

```typescript
// ❌ SAI: N+1 query problem
async getPosts(): Promise<Post[]> {
  const posts = await this.postModel.find();  // 1 query → 100 posts

  for (const post of posts) {
    // Với mỗi post, 1 query riêng → 100 queries!
    post.author = await this.userModel.findById(post.authorId);
  }

  return posts;
  // Tổng: 1 + 100 = 101 queries!
}
```

**Với 100 posts:** 101 database round trips
**Với 1000 posts:** 1001 database round trips
**Mỗi round trip ~1-5ms → 100 posts = 100-500ms chỉ cho DB calls**

### 2.2 Cách phát hiện N+1

**Trong development:** Enable MongoDB query logging:
```typescript
// Khi kết nối Mongoose, enable debug
mongoose.set('debug', true);

// Output:
// Mongoose: posts.find({})
// Mongoose: users.findOne({ _id: ObjectId('...') })
// Mongoose: users.findOne({ _id: ObjectId('...') })
// ... (lặp 100 lần)
```

**Dấu hiệu:** Nhiều query giống nhau với `_id` khác nhau chạy liên tiếp.

### 2.3 Fix: Populate (Mongoose)

```typescript
// ✅ ĐÚNG: populate = MongoDB JOIN
async getPosts(): Promise<Post[]> {
  return this.postModel
    .find()
    .populate('authorId', 'name email avatar')  // 1 query additional
    .exec();
  // Tổng: 2 queries thay vì 101
}
```

Mongoose thực hiện:
1. `db.posts.find()` → 100 posts
2. `db.users.find({ _id: { $in: [id1, id2, ..., id100] } })` → 1 batch query

### 2.4 Fix: Aggregation Pipeline (phức tạp hơn)

```typescript
// Khi cần transform data phức tạp
async getPostsWithStats(): Promise<any[]> {
  return this.postModel.aggregate([
    {
      $lookup: {
        from: 'users',           // Collection name (không phải model name)
        localField: 'authorId',
        foreignField: '_id',
        as: 'author',
      },
    },
    { $unwind: '$author' },
    {
      $lookup: {
        from: 'comments',
        localField: '_id',
        foreignField: 'postId',
        as: 'comments',
      },
    },
    {
      $project: {
        title: 1,
        content: 1,
        'author.name': 1,
        'author.email': 1,
        commentCount: { $size: '$comments' },
      },
    },
  ]);
  // Tất cả trong 1 aggregation query!
}
```

### 2.5 Dataloader Pattern (advanced)

Khi dùng GraphQL hoặc cần batch loading phức tạp:

```typescript
// Thay vì gọi findById nhiều lần, batch lại
import DataLoader from 'dataloader';

@Injectable()
export class UserLoader {
  private loader = new DataLoader<string, User>(async (ids) => {
    const users = await this.userModel.find({ _id: { $in: ids } });
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    return ids.map(id => userMap.get(id) ?? null);
  });

  load(id: string): Promise<User | null> {
    return this.loader.load(id);
  }
}
```

---

## 3. Database Indexing

### 3.1 Tại sao cần index?

Không có index, MongoDB phải **scan toàn bộ collection** (Collection Scan) để tìm document. Với 10 triệu documents:
- Collection scan: O(n) = 10 triệu phép so sánh
- Index lookup: O(log n) = ~23 phép so sánh

**Ví dụ:**
```typescript
// Tìm user theo email — không có index
await this.userModel.findOne({ email: 'user@example.com' });
// MongoDB scan 1 triệu documents để tìm → 200ms

// Sau khi thêm index
userSchema.index({ email: 1 }, { unique: true });
// MongoDB lookup trong B-tree → 1ms
```

### 3.2 B-tree Index — cách hoạt động

```
Index B-tree cho field 'email':

                    [m]
                   /   \
              [d,h]     [r,w]
             /  |  \    /   \
           [a] [e] [j] [s]  [z]
            |   |   |   |    |
         alice eve jon sue  zoe
```

- **Insert/Update:** O(log n) để maintain tree
- **Lookup:** O(log n) = rất nhanh ngay cả với 100M records
- **Range query:** B-tree ordered → range scan hiệu quả

### 3.3 Các loại index trong Mongoose

```typescript
// 1. Single field index
userSchema.index({ email: 1 });        // ascending
userSchema.index({ createdAt: -1 });   // descending (cho sort mới nhất trước)

// 2. Unique index
userSchema.index({ email: 1 }, { unique: true });

// 3. Compound index
orderSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Phục vụ queries: { userId }, { userId, status }, { userId, status, createdAt }
// KHÔNG phục vụ: { status } (phải bắt đầu từ field đầu tiên)

// 4. Text index (full-text search)
productSchema.index({ name: 'text', description: 'text' });
// Query: { $text: { $search: 'laptop gaming' } }

// 5. Sparse index (bỏ qua documents không có field)
userSchema.index({ googleId: 1 }, { sparse: true });
// Chỉ index documents có googleId field

// 6. TTL index (auto-delete sau N giây)
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });
// Document tự xóa sau 1 giờ kể từ createdAt
```

### 3.4 Covered Queries

**Covered query:** Query được thực hiện hoàn toàn bằng index, không cần đọc documents.

```typescript
// Compound index: { userId: 1, status: 1, createdAt: -1 }
orderSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Covered query: chỉ cần các fields có trong index
const orders = await this.orderModel
  .find({ userId: '123', status: 'active' })
  .sort({ createdAt: -1 })
  .select('userId status createdAt -_id')  // Chỉ project fields trong index
  .lean();  // Không hydrate Mongoose document → nhanh hơn
```

### 3.5 EXPLAIN — đọc execution plan

```javascript
// Trong MongoDB Shell hoặc Compass
db.orders.explain('executionStats').find({ userId: '123' })

// Output quan trọng:
{
  "executionStats": {
    "executionTimeMillis": 2,       // ← Thời gian thực thi
    "totalKeysExamined": 15,        // ← Số index keys được scan
    "totalDocsExamined": 15,        // ← Số documents được đọc
    "nReturned": 15,                // ← Số documents trả về
    "winningPlan": {
      "stage": "FETCH",             // ← IXSCAN = dùng index ✅
      "inputStage": {               // ← COLLSCAN = không có index ❌
        "stage": "IXSCAN",
        "indexName": "userId_1"
      }
    }
  }
}
```

**Dấu hiệu cần thêm index:**
- `stage: "COLLSCAN"` → không có index
- `totalDocsExamined >> nReturned` → index không selective

### 3.6 Trong NestJS với Mongoose

```typescript
// Tương đương explain()
const result = await this.orderModel
  .find({ userId: '123' })
  .explain('executionStats');

console.log(JSON.stringify(result[0].executionStats, null, 2));
```

---

## 4. Connection Pooling

### 4.1 Vấn đề: 1 connection per request

```
Request 1 → connect() → query → disconnect()  [50ms overhead]
Request 2 → connect() → query → disconnect()  [50ms overhead]
...
```

Mỗi connection bao gồm: TCP handshake + TLS negotiation + MongoDB auth = 20-50ms.

Với 100 requests/giây → 100 connection setups → 2-5 seconds overhead mỗi giây.

### 4.2 Connection Pool

```
Pool khởi tạo 10 connections sẵn sàng:
┌────────────────────────────────────┐
│ conn1 conn2 conn3 ... conn10       │
└────────────────────────────────────┘

Request 1 → lấy conn1 → query → trả conn1 về pool
Request 2 → lấy conn2 → query → trả conn2 về pool
```

Không có connection setup overhead → query bắt đầu ngay lập tức.

### 4.3 Cấu hình connection pool trong nestjs-boot

```typescript
// Trong DatabaseOptions
const databaseOptions: DatabaseOptions = {
  connections: {
    main: {
      writerUri: process.env.MONGO_URI,
      readerUri: process.env.MONGO_READ_URI,  // Read replica
      options: {
        maxPoolSize: 10,      // Tối đa 10 connections trong pool
        minPoolSize: 2,       // Giữ ít nhất 2 connections sẵn sàng
        maxIdleTimeMS: 30000, // Đóng connection idle sau 30s
        serverSelectionTimeoutMS: 5000,  // Timeout khi không tìm được server
      },
    },
  },
};
```

---

## 5. Reader/Writer Split trong nestjs-boot

### 5.1 Tại sao cần Reader/Writer split?

Read-heavy applications (e.g., e-commerce product listing):
- 90% traffic là READ (browse products, search, view orders)
- 10% traffic là WRITE (create order, update profile)

**Giải pháp:** MongoDB Replica Set
- **Primary** (Writer): nhận tất cả writes, replicate sang secondaries
- **Secondary** (Reader): chỉ phục vụ reads, giảm tải cho primary

```
Client
  ├── Write operations → Primary (Writer)
  └── Read operations  → Secondary (Reader) [load balanced across multiple secondaries]
```

### 5.2 Cách nestjs-boot implement

`src/database/connection.factory.ts` tạo 2 connections:

```typescript
// Writer connection (luôn được tạo)
MongooseModule.forRoot(connectionConfig.writerUri, {
  connectionName: getWriterConnectionName(name),  // e.g., 'main_writer'
  ...mongooseOptions,
})

// Reader connection (chỉ tạo nếu readerUri được cung cấp)
if (connectionConfig.readerUri) {
  MongooseModule.forRoot(connectionConfig.readerUri, {
    connectionName: getReaderConnectionName(name),  // e.g., 'main_reader'
    ...mongooseOptions,
  })
}
```

`src/database/base.repository.ts` tự động route đúng connection:

```typescript
export class BaseRepository<T extends Document> {
  protected readonly readerModel: Model<T> | null;
  protected readonly writerModel: Model<T>;

  // READ operations → readerModel (nếu có) hoặc writerModel
  protected get readModel(): Model<T> {
    return this.readerModel ?? this.writerModel;
  }

  // findAll, findById, findOne, count, aggregate → dùng readModel
  async findAll(filter, options): Promise<PaginatedResult<T>> {
    const query = this.readModel.find(filter);  // ← Reader
    // ...
  }

  // WRITE operations → luôn dùng writerModel
  async create(data): Promise<T> {
    const doc = new this.writerModel(data);  // ← Writer
    return doc.save();
  }
}
```

**Benefit:** Repository tự động dùng đúng connection — code business logic không cần biết về reader/writer split.

---

## 6. Load Testing với K6

### 6.1 Cài đặt

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:443 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### 6.2 Script K6 cơ bản

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Ramp-up pattern: 1 → 10 → 50 → 100 VUs
export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up to 10 VUs over 1 minute
    { duration: '2m', target: 50 },   // Ramp up to 50 VUs
    { duration: '3m', target: 100 },  // Ramp up to 100 VUs (peak)
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% requests < 500ms
    errors: ['rate<0.01'],             // Error rate < 1%
  },
};

export default function () {
  // Test GET /products
  const res = http.get('http://localhost:3000/products?page=1&limit=20', {
    headers: {
      Authorization: `Bearer ${__ENV.JWT_TOKEN}`,
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has data field': (r) => JSON.parse(r.body).data !== undefined,
  });

  errorRate.add(res.status !== 200);

  sleep(1);  // 1 second think time between requests
}
```

### 6.3 Chạy và đọc kết quả

```bash
k6 run load-test.js

# Output:
✓ status is 200
✓ response time < 200ms

  scenarios: (100.00%) 1 scenario, 100 max VUs, 7m30s max duration

  data_received..................: 45 MB  100 kB/s
  http_req_duration..............: avg=45ms  min=12ms  med=38ms  max=892ms  p(90)=89ms  p(95)=156ms  p(99)=423ms
  http_req_failed................: 0.12%  ✓ 0        ✗ 145
  http_reqs......................: 12450  28.79/s    ← RPS (Requests per Second)
  iterations.....................: 12450  28.79/s
  vus............................: 100    min=1      max=100
```

**Đọc kết quả:**
- `avg`: Trung bình — nhưng không đủ thông tin (outliers kéo lên)
- `p(50)/med`: 50% requests hoàn thành trong bao lâu (median)
- `p(95)`: 95% requests hoàn thành trong bao lâu → **KPI quan trọng nhất**
- `p(99)`: Worst case trải nghiệm user
- `http_req_failed`: Error rate — nên < 1%

### 6.4 Xác định bottleneck

**Sau khi chạy K6, kiểm tra:**

```bash
# CPU usage
top -p $(pgrep node)

# Memory
ps aux --sort=-%mem | head -5

# MongoDB slow queries (>100ms)
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find().sort({ ts: -1 }).limit(10)

# Số connections
db.serverStatus().connections
# { "current": 45, "available": 955, "totalCreated": 1200 }
```

**Bottleneck patterns:**
- CPU cao + latency cao → code inefficiency (regex, crypto, sync ops)
- Memory tăng liên tục → memory leak
- DB slow queries → missing index hoặc N+1
- Connection pool exhausted → tăng `maxPoolSize` hoặc scale DB

---

## 7. Horizontal vs Vertical Scaling

### 7.1 Vertical Scaling (Scale up)

**Nâng cấp server:** 2 CPU → 8 CPU, 8GB RAM → 32GB RAM

✅ Đơn giản, không thay đổi code
❌ Có giới hạn (hardware ceiling)
❌ Downtime khi upgrade
❌ Expensive (linear cost, superlinear performance gain)

### 7.2 Horizontal Scaling (Scale out)

**Thêm nhiều server:** 1 instance → 10 instances + load balancer

✅ Không giới hạn lý thuyết
✅ High availability (1 instance fail → traffic redirect)
✅ Cost-effective ở scale lớn
❌ Cần stateless design (session không thể lưu trong memory)
❌ Phức tạp hơn (distributed system problems)

**Stateless NestJS để horizontal scale:**
```typescript
// ❌ SAI: In-memory session → chỉ work với 1 instance
const sessions = new Map<string, Session>();

// ✅ ĐÚNG: Redis session → work với N instances
@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      host: process.env.REDIS_HOST,
      port: 6379,
    }),
  ],
})
```

### 7.3 Khi nào chọn cái nào?

```
Traffic nhỏ → nhỏ? → Vertical (đơn giản hơn)
Traffic lớn → horizontal (thêm instances)
Database read-heavy? → Read replicas (horizontal for DB reads)
Database write-heavy? → Sharding (complex, tránh nếu được)
```

---

## 8. System Design: RESHADED Framework

Framework cho system design interviews và thực tế:

```
R - Requirements
E - Estimation
S - Storage
H - High-level design
A - API design
D - Detailed design
E - Evaluation
D - Deployment
```

### Ví dụ: Design URL Shortener (bit.ly)

**R — Requirements:**
```
Functional:
- User nhập long URL → nhận short URL (e.g., bit.ly/abc123)
- User truy cập short URL → redirect đến long URL
- Optional: analytics (click count, referrer)

Non-functional:
- 100M URLs created/day
- Read:Write = 100:1 (reads dominant)
- Latency: < 10ms cho redirect
- High availability: 99.99%
```

**E — Estimation:**
```
Writes: 100M URLs/day = ~1,200 URLs/second
Reads: 100:1 ratio = 120,000 redirects/second

Storage:
- 1 URL entry: ~500 bytes
- 100M/day × 365 days × 5 years = 182.5 billion entries
- 182.5B × 500 bytes = ~91 TB

Bandwidth:
- Write: 1,200/s × 500B = 0.6 MB/s
- Read: 120,000/s × 500B = 60 MB/s
```

**S — Storage:**
```
URLs table:
- short_key: VARCHAR(8) — primary key, indexed
- long_url: TEXT
- created_at: TIMESTAMP
- expires_at: TIMESTAMP (nullable)
- user_id: UUID (nullable)
- click_count: BIGINT

Storage choice: PostgreSQL/MySQL (relational, ACID)
Cache: Redis (hot URLs, 90% cache hit rate)
```

**H — High-level design:**
```
Client → CDN/Load Balancer → URL Service → Redis Cache → DB

Short URL generation:
- Base62 encoding (a-z, A-Z, 0-9) = 62 chars
- 7 chars = 62^7 = 3.5 trillion combinations
- Random + check collision (hoặc counter + hash)
```

**A — API:**
```
POST /shorten
Body: { longUrl: string, expiresIn?: number }
Response: { shortUrl: string, shortKey: string }

GET /:shortKey
Response: 301 Redirect → longUrl
```

**D — Detailed design (focus on redirect):**
```
1. Client: GET /abc123
2. Load Balancer → URL Service
3. Check Redis cache:
   - HIT: return longUrl immediately → 1ms
   - MISS: query DB → cache result → return → 10ms
4. 301 vs 302 redirect:
   - 301 (Permanent): browser caches → không count clicks
   - 302 (Temporary): browser không cache → count clicks (analytics)
```

**E — Evaluation:**
```
Bottleneck: 120K redirects/sec
Với Redis cache: ~100K ops/sec per instance → cần 2-3 Redis instances

DB: read replicas cho reads, writer chỉ cho creates
CDN: cache popular short URLs tại edge nodes → giảm latency toàn cầu

Failure scenarios:
- Redis down: fallback to DB (slower but functional)
- DB down: serve từ cache (read-only mode)
```

**D — Deployment:**
```
Multi-region active-active deployment
- Region US-East, EU-West, APAC
- GeoDNS route user đến region gần nhất
- Cross-region DB replication
```

---

## 9. Hands-on Lab

### Lab 1: Profile slow endpoint

```bash
# Enable MongoDB profiling
mongosh myapp
db.setProfilingLevel(1, { slowms: 50 })  # Log queries > 50ms

# Chạy app, generate traffic
# Xem slow queries
db.system.profile.find({ millis: { $gt: 50 } }).sort({ ts: -1 }).limit(10)
```

### Lab 2: Fix N+1 và benchmark

1. Viết endpoint `GET /posts` với N+1 problem
2. Benchmark với K6 (10 VUs, 30s)
3. Fix bằng `populate()`
4. Benchmark lại
5. Viết performance report:

```markdown
## Performance Report: GET /posts

### Before (N+1 problem)
- p50: 450ms
- p95: 892ms
- RPS: 12/s
- DB queries per request: 101

### After (populate)
- p50: 45ms
- p95: 89ms
- RPS: 120/s
- DB queries per request: 2

### Improvement: 10x throughput, 10x latency improvement
### Root cause: 100 individual findById calls replaced by 1 batch query
```

### Lab 3: System Design Practice

Viết system design cho một trong:
1. Rate limiter (như @nestjs/throttler)
2. Notification system (push + email + SMS)
3. News feed (giống Facebook timeline)

Sử dụng RESHADED framework, 1-2 trang A4.

---

## 10. Lỗi thường gặp

| Lỗi | Impact | Fix |
|-----|--------|-----|
| N+1 queries | 10-100x slower với large datasets | Dùng populate() hoặc aggregate() |
| Index trên wrong field | Full collection scan | EXPLAIN analyze, index theo filter fields |
| Over-indexing | Write performance giảm (mỗi write phải update tất cả indexes) | Chỉ index fields thực sự được query |
| Connection pool quá nhỏ | Requests queue chờ connection | Tăng maxPoolSize, monitor pool usage |
| Synchronous CPU-heavy ops | Block Event Loop → toàn bộ app chậm | Dùng worker threads hoặc chuyển lên background job |
| No .lean() cho read-only queries | Mongoose hydrate objects không cần thiết | Thêm .lean() khi không cần Mongoose methods |

---

## 11. Câu hỏi tự kiểm tra

1. N+1 problem là gì? Cho ví dụ với 50 users, mỗi user có N orders — không có N+1 fix sẽ có bao nhiêu queries?
2. Tại sao compound index `{ userId: 1, status: 1 }` phục vụ query `{ userId: '123' }` nhưng KHÔNG phục vụ `{ status: 'active' }` một mình?
3. `p95 = 500ms` nghĩa là gì? Tại sao p95 quan trọng hơn average?
4. Reader/Writer split giải quyết vấn đề gì? Khi nào nên dùng?
5. Sự khác biệt giữa vertical scaling và horizontal scaling? NestJS cần gì để horizontal scale?
6. Trong URL shortener, tại sao dùng 302 (Temporary Redirect) thay vì 301 (Permanent)?
7. `.lean()` trong Mongoose làm gì và khi nào nên dùng?

---

## 12. Đọc thêm

- [Use the Index, Luke](https://use-the-index-luke.com/) — Index fundamentals
- [K6 Documentation](https://k6.io/docs/)
- [System Design Primer](https://github.com/donnemartin/system-design-primer)
- [MongoDB Performance Best Practices](https://www.mongodb.com/docs/manual/core/query-optimization/)
- [Designing Data-Intensive Applications](https://dataintensive.net/) — Martin Kleppmann (must-read)
- nestjs-boot source: `src/database/base.repository.ts`, `src/database/connection.factory.ts`
