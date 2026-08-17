# Tuần 16: Capstone Project & Career Preparation

> **Stage 4 — Production | nestjs-boot Teaching Series**
> Đây là tuần cuối của khóa học. Bạn đã sẵn sàng.

---

## Mục tiêu tuần này

1. Hoàn thiện Capstone Project đạt đủ rubric
2. Demo sản phẩm tự tin trong 15 phút
3. Chuẩn bị CV, GitHub portfolio, và interview skills
4. Lập kế hoạch học tập sau khóa học

---

## Phần 1: Capstone Project

### 1.1 Tổng quan

Capstone là dự án tổng hợp toàn bộ kiến thức 16 tuần. Bạn sẽ xây dựng một backend API **production-ready** bao gồm đầy đủ: authentication, authorization, caching, background jobs, testing, CI/CD, và documentation.

**Thời gian:** 2 tuần (Tuần 15-16, song song với học lý thuyết)
**Hình thức:** Cá nhân hoặc nhóm 2 người
**Output:** GitHub repository + Demo 15 phút + Báo cáo kỹ thuật 1 trang

---

### 1.2 Yêu cầu kỹ thuật (Rubric chi tiết)

#### A. Backend Core (Bắt buộc)

| Yêu cầu | Chi tiết | Điểm |
|---------|----------|------|
| NestJS framework | Dùng NestJS 10+, TypeScript strict mode | 5 |
| ≥3 modules | Mỗi module có controller, service, repository | 5 |
| MongoDB với Mongoose | Schema typing đầy đủ, không dùng `any` | 5 |
| Typed config | ConfigModule với validation (Zod hoặc class-validator) | 5 |

**Ví dụ typed config:**
```typescript
// config/app.config.ts
import { z } from 'zod';

const AppConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
  MONGO_URI: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = AppConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Config validation failed: ${result.error.message}`);
  }
  return result.data;
}
```

#### B. Authentication & Authorization (Bắt buộc)

| Yêu cầu | Chi tiết | Điểm |
|---------|----------|------|
| JWT authentication | Access token + JwtAuthGuard | 5 |
| RBAC | ≥2 roles, RolesGuard, @Roles() decorator | 5 |
| Refresh token | Separate endpoint, stored in DB, revocable | 5 |

**Refresh token flow cơ bản:**
```typescript
// auth.service.ts
async refreshToken(token: string): Promise<{ accessToken: string }> {
  // 1. Tìm refresh token trong DB
  const storedToken = await this.refreshTokenModel.findOne({
    token,
    revoked: false,
    expiresAt: { $gt: new Date() },
  });

  if (!storedToken) throw new UnauthorizedException('Invalid refresh token');

  // 2. Verify JWT
  const payload = this.jwtService.verify(token, {
    secret: process.env.JWT_REFRESH_SECRET,
  });

  // 3. Issue new access token
  return {
    accessToken: this.jwtService.sign(
      { sub: payload.sub, role: payload.role },
      { expiresIn: '15m' },
    ),
  };
}

async logout(refreshToken: string): Promise<void> {
  // Revoke token → không thể dùng lại
  await this.refreshTokenModel.updateOne(
    { token: refreshToken },
    { revoked: true },
  );
}
```

#### C. Cache (Bắt buộc)

| Yêu cầu | Chi tiết | Điểm |
|---------|----------|------|
| Redis cache-aside | Cache GET responses, invalidate on mutation | 5 |
| Invalidation strategy | Update/Delete → xóa cache tương ứng | 5 |

**Cache-aside pattern:**
```typescript
// products.service.ts
async findById(id: string): Promise<Product> {
  const cacheKey = `product:${id}`;

  // 1. Check cache
  const cached = await this.cacheService.get<Product>(cacheKey);
  if (cached) return cached;

  // 2. Cache miss → query DB
  const product = await this.productRepo.findById(id);
  if (!product) throw new NotFoundException();

  // 3. Store in cache (TTL: 5 phút)
  await this.cacheService.set(cacheKey, product, 300);

  return product;
}

async update(id: string, dto: UpdateProductDto): Promise<Product> {
  const product = await this.productRepo.update(id, dto);

  // 4. Invalidate cache sau khi update
  await this.cacheService.del(`product:${id}`);
  await this.cacheService.del('products:list:*');  // Xóa list cache

  return product;
}
```

#### D. Background Jobs (Bắt buộc)

| Yêu cầu | Chi tiết | Điểm |
|---------|----------|------|
| ≥1 background job với BullMQ | Queue với retry policy | 5 |
| Job types | Email, notification, report generation... | 5 |

**Ví dụ job với retry:**
```typescript
// email.processor.ts
@Processor('email')
export class EmailProcessor {
  @Process('welcome-email')
  async sendWelcomeEmail(job: Job<{ userId: string; email: string }>) {
    const { userId, email } = job.data;

    try {
      await this.emailService.send({
        to: email,
        subject: 'Welcome!',
        template: 'welcome',
        context: { userId },
      });
    } catch (err) {
      // BullMQ tự động retry theo config
      throw err;  // Re-throw để BullMQ biết job failed
    }
  }
}

// Trong Queue config:
BullModule.registerQueue({
  name: 'email',
  defaultJobOptions: {
    attempts: 3,              // Retry 3 lần
    backoff: {
      type: 'exponential',
      delay: 2000,            // 2s, 4s, 8s
    },
    removeOnComplete: 100,    // Giữ 100 completed jobs cho debugging
    removeOnFail: 50,
  },
})
```

#### E. Testing (Bắt buộc)

| Yêu cầu | Chi tiết | Điểm |
|---------|----------|------|
| ≥70% code coverage | `npm test -- --coverage` | 10 |
| Negative tests | Test lỗi, edge cases, invalid input | 5 |
| Integration tests | Test controller → service → DB (in-memory MongoDB) | 5 |

**Ví dụ negative test:**
```typescript
describe('ProductsService.create', () => {
  // Positive test
  it('should create product successfully', async () => {
    const dto = { name: 'Laptop', price: 999, stock: 10 };
    const product = await service.create(dto);
    expect(product.name).toBe('Laptop');
  });

  // Negative tests
  it('should throw when name is duplicate', async () => {
    await service.create({ name: 'Laptop', price: 999, stock: 10 });
    await expect(
      service.create({ name: 'Laptop', price: 888, stock: 5 })
    ).rejects.toThrow(ConflictException);
  });

  it('should throw when price is negative', async () => {
    await expect(
      service.create({ name: 'Laptop', price: -1, stock: 10 })
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw when stock is zero and product is physical', async () => {
    await expect(
      service.create({ name: 'Laptop', price: 999, stock: 0, type: 'physical' })
    ).rejects.toThrow(BadRequestException);
  });
});
```

#### F. CI/CD (Bắt buộc)

| Yêu cầu | Chi tiết | Điểm |
|---------|----------|------|
| GitHub Actions green | Lint + typecheck + build + test + npm audit | 10 |
| Docker Compose | app + MongoDB + Redis trong 1 file | 5 |

#### G. Documentation (Bắt buộc)

| Yêu cầu | Chi tiết | Điểm |
|---------|----------|------|
| Swagger UI | Tất cả endpoints có description, request/response schema | 5 |
| README | Setup instructions, environment variables, architecture | 5 |

#### H. Bonus

| Yêu cầu | Điểm bonus |
|---------|-----------|
| gRPC giữa 2 services | +10 |
| Grafana dashboard | +5 |
| Event-driven flow (EventEmitter/RabbitMQ) | +5 |
| WebSocket real-time | +5 |

---

### 1.3 Scoring Rubric

| Category | Weight | Mô tả |
|----------|--------|-------|
| Functionality | 40% | API hoạt động đúng, edge cases handled |
| Code Quality | 20% | TypeScript strict, SOLID principles, clean architecture |
| Testing | 15% | Coverage ≥70%, negative tests, meaningful assertions |
| CI/CD | 10% | Pipeline xanh, Docker Compose hoạt động |
| Documentation | 10% | Swagger đầy đủ, README rõ ràng |
| Demo | 5% | Trình bày rõ ràng, trả lời được câu hỏi |

---

### 1.4 Project Topic Suggestions

#### Option 1: E-commerce Platform

**Modules:** Product, Order, User, Payment

**User stories:**
- Seller: đăng sản phẩm, xem đơn hàng
- Buyer: browse sản phẩm, tạo đơn hàng, thanh toán

**Flow đặc trưng:**
```
POST /orders → [OrderService]
  → Check product stock (ProductService)
  → Create order (pending)
  → Enqueue payment job (BullMQ)
  → [PaymentJob] → Call payment gateway
  → [PaymentWebhookHandler] → Update order status
  → Emit OrderConfirmedEvent
  → [EmailJob] → Send confirmation email
```

**Cấu trúc module đề xuất:**
```
src/
├── users/           # Auth + profile
├── products/        # CRUD + search
├── orders/          # Order lifecycle
├── payments/        # Webhook handler + payment status
└── notifications/   # Email queue processor
```

---

#### Option 2: Blog Platform

**Modules:** Post, Comment, User, Feed

**User stories:**
- Writer: tạo post với markdown, manage drafts
- Reader: đọc posts, comment, like, theo dõi writers

**Flow đặc trưng:**
```
POST /posts/:id/publish → [PostService]
  → Update status: draft → published
  → Invalidate post cache
  → Emit PostPublishedEvent
  → [FeedService] fanout → thêm vào feed của followers
  → Cache feed với Redis sorted sets (score = timestamp)
```

**Điểm kỹ thuật thú vị:**
- Feed timeline: Redis Sorted Set, score = Unix timestamp
- Full-text search: MongoDB text index trên title + content
- Comment threaded: parent-child relationship, max depth 3

---

#### Option 3: Task Management (Jira-like)

**Modules:** Workspace, Board, Task, User, Activity

**User stories:**
- Admin: tạo workspace, invite members, set roles
- Member: tạo tasks, assign, move qua columns, comment

**Flow đặc trưng:**
```
PATCH /tasks/:id/status → [TaskService]
  → Update task status
  → Create ActivityLog entry (audit trail)
  → Emit TaskStatusChangedEvent
  → [NotificationJob] → Notify assignee + watchers
  → WebSocket broadcast → Real-time board update
```

**Điểm kỹ thuật:**
- RBAC phức tạp: workspace owner, board admin, member, viewer
- Activity log: immutable audit trail
- Real-time: WebSocket cho board updates (nestjs-boot websocket module)

---

#### Option 4: Chat Application

**Modules:** Room, Message, User, Notification

**User stories:**
- Tạo phòng chat (private/public)
- Gửi/nhận tin nhắn real-time
- Notification khi có mention

**Flow đặc trưng:**
```
WebSocket: message.send → [ChatGateway]
  → Validate message (max 4000 chars, no XSS)
  → Save to DB
  → Broadcast đến room members
  → Check mentions (@username)
  → [NotificationJob] → Push notification đến offline users
  → Mark as delivered khi user online lại
```

**Điểm kỹ thuật:**
- WebSocket với JWT auth (không phải HTTP auth)
- Presence system: online/offline/last seen với Redis
- Read receipts: per-user-per-message read status

---

### 1.5 Demo Day Format

**Cấu trúc 15 phút + 5 phút Q&A:**

```
0:00 - 2:00  Introduction (2 phút)
  - Tên project, vấn đề giải quyết
  - Tech stack chọn lý do gì

2:00 - 8:00  Live Demo (6 phút)
  - Demo flow chính (happy path)
  - Ít nhất 1 tính năng "wow" (real-time, job, etc.)

8:00 - 12:00 Architecture Deep Dive (4 phút)
  - Diagram hệ thống (vẽ tay hoặc draw.io)
  - Giải thích 1 decision khó (tại sao chọn giải pháp A thay vì B)

12:00 - 15:00 Code Walkthrough (3 phút)
  - 1 service phức tạp nhất
  - Test case thú vị nhất

15:00 - 20:00 Q&A (5 phút)
  - Giám khảo hỏi về code, decisions, trade-offs
```

**Tips cho Demo:**

- **Chuẩn bị data sẵn:** Không live-type username/password → dùng script seed data
- **Backup plan:** Screenshot + video nếu localhost có vấn đề
- **Biết trade-offs:** "Tôi dùng X vì... nhược điểm là... nếu scale thêm tôi sẽ..."
- **Own your bugs:** "Biết có vấn đề ở Y, plan fix là..."

---

## Phần 2: Career Preparation

### 2.1 CV cho Backend Engineer

**Cấu trúc 1 trang (dưới 3 năm kinh nghiệm):**

```
[Tên] | Backend Engineer
[Email] | [GitHub] | [LinkedIn] | [Location]

EXPERIENCE (nếu có internship/freelance)
Company Name | Role | Date
- Built X that improved Y by Z% (STAR format, có số liệu)
- Implemented A using B, reducing C from X to Y

PROJECTS
nestjs-boot Capstone — E-commerce API
- NestJS 10, MongoDB, Redis, BullMQ, Docker, GitHub Actions
- Implemented JWT + RBAC auth with refresh token flow
- Achieved 78% test coverage with Jest, CI pipeline via GitHub Actions
- [GitHub link] [Live demo link if any]

SKILLS
Languages: TypeScript, JavaScript, SQL
Frameworks: NestJS, Express
Databases: MongoDB, PostgreSQL, Redis
Tools: Docker, GitHub Actions, Git

EDUCATION
[University] | Computer Science | Expected [Year]
GPA: X.X/4.0 (chỉ ghi nếu ≥ 3.5)
```

**Những gì KHÔNG nên viết:**
- Objective statement ("I want to grow and learn...") → waste của không gian
- Kỹ năng không thể verify ("Fast learner", "Team player")
- Microsoft Office, Google Suite (baseline expected)
- Photo (trừ khi tuyển dụng ở nơi require)
- Tham khảo ("References available upon request") → assume by default

**Action verbs (dùng thay vì "did/made/helped"):**
Built, Implemented, Designed, Optimized, Reduced, Increased, Migrated, Refactored, Shipped, Deployed

---

### 2.2 GitHub Portfolio

**Anatomy của GitHub profile ấn tượng:**

```
Profile picture + Bio + Location + Company

Pinned repositories (6 tối đa):
├── capstone-project (nestjs, mongodb, redis)
├── nestjs-boot (contribution hoặc fork có improvements)
├── [personal project 3]
└── [algorithm practice repo — không bắt buộc]

Contribution graph: xanh đều đặn quan trọng hơn burst xanh
Activity: public commits, PRs, issues
```

**README.md template cho projects:**

```markdown
# Project Name

Brief description (1-2 sentences)

## Features
- Feature 1
- Feature 2

## Tech Stack
- NestJS 10, TypeScript
- MongoDB with Mongoose
- Redis (caching + queue)
- Docker + GitHub Actions CI

## Quick Start
\`\`\`bash
git clone ...
cp .env.example .env
docker compose up -d
npm install
npm run start:dev
\`\`\`

## Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| MONGO_URI | MongoDB connection string | mongodb://localhost:27017/myapp |
| JWT_SECRET | ≥32 chars secret | your-secret-here |

## API Documentation
Swagger UI available at `http://localhost:3000/api`

## Architecture
[Simple diagram hoặc description]
```

**Commit history quality:**
```bash
# ❌ Xấu
git commit -m "fix"
git commit -m "update"
git commit -m "wip"

# ✅ Tốt (Conventional Commits)
git commit -m "feat(auth): add refresh token with 7-day expiry"
git commit -m "fix(orders): prevent duplicate order creation on retry"
git commit -m "test(products): add negative tests for stock validation"
git commit -m "perf(products): add compound index for userId+status query"
```

---

### 2.3 System Design Interview

**Framework RESHADED (xem Tuần 15) — cách apply trong interview:**

```
Phút 1-3:   Clarify requirements (đừng assume!)
  "Bao nhiêu users?"
  "Read-heavy hay write-heavy?"
  "Cần real-time không?"
  "Availability priority hay consistency?"

Phút 3-6:   Back-of-envelope estimation
  "100K DAU × 10 actions/day = 1M ops/day = ~12 ops/second"

Phút 6-15:  High-level design (vẽ diagram)
  Client → Load Balancer → App Servers → Cache → DB

Phút 15-25: Deep dive vào 1-2 components phức tạp
  (Interviewer thường chọn component để đào sâu)

Phút 25-30: Trade-offs và improvements
  "Nếu scale lên 10x, tôi sẽ..."
```

**Câu hỏi hay gặp:**

- Design a URL shortener
- Design a rate limiter
- Design a notification system
- Design a news feed (Facebook/Twitter timeline)
- Design a distributed job queue

---

### 2.4 Behavioral Interview — STAR Method

**STAR = Situation → Task → Action → Result**

**Ví dụ với backend context:**

**Câu hỏi:** "Tell me about a time you improved performance."

**Trả lời theo STAR:**
```
Situation: API endpoint GET /products chạy 2-3 giây khi database có 500K products

Task: Cần giảm xuống < 200ms để đạt SLA

Action:
1. Enable MongoDB profiler, xác định query không dùng index
2. Phân tích query pattern: luôn filter theo category + status
3. Thêm compound index { category: 1, status: 1 }
4. Thêm .select() để không load unnecessary fields
5. Thêm Redis cache với TTL 5 phút cho popular categories

Result:
- p95 từ 2800ms → 45ms (62x improvement)
- CPU usage giảm 40% do ít MongoDB work hơn
- Cache hit rate 87% sau 1 tuần
```

**Các câu hay gặp và hướng trả lời:**

| Câu hỏi | Key points cần mention |
|---------|----------------------|
| Conflict với teammate | Listen first, data-driven discussion, compromise |
| Deadline tight → cut corners | Communicate risk early, tech debt tracking, no silent shortcuts |
| Bug in production | Immediate mitigation, root cause analysis, prevention |
| Disagreed with tech decision | Raised concerns with data, accepted team decision, documented |

---

### 2.5 Contributing to Open Source

**nestjs-boot là cơ hội tốt để bắt đầu:**

**Bước 1:** Fork repository
```bash
# Fork trên GitHub UI, rồi:
git clone https://github.com/YOUR_USERNAME/nestjs-boot.git
cd nestjs-boot
git remote add upstream https://github.com/nthanhdo/nestjs-boot.git
```

**Bước 2:** Tìm issue phù hợp
- Label `good first issue` → dành cho người mới
- Label `help wanted` → maintainer cần support
- Hoặc tìm bug/improvement bạn thấy khi dùng trong capstone

**Bước 3:** Tạo branch và implement
```bash
git checkout -b fix/issue-123-description
# Implement, test, đảm bảo CI pass
git push origin fix/issue-123-description
```

**Bước 4:** Mở Pull Request
- Title rõ ràng: `fix: prevent path traversal in LocalAdapter.exists()`
- Description: link issue, mô tả thay đổi, test evidence
- Nhỏ và focused: 1 PR = 1 vấn đề

**Tại sao open source contribution quan trọng:**
- Code được senior engineer review → học được patterns mới
- Chứng minh bạn có thể làm việc trong codebase người khác
- LinkedIn/CV: "Contributor to nestjs-boot (1.2K stars)"
- Network với community

---

### 2.6 Learning Path After This Course

Bạn đã nắm vững backend với NestJS. Đây là roadmap cho 6-12 tháng tiếp theo:

**Immediate (1-3 tháng):**
```
System Design depth:
├── "Designing Data-Intensive Applications" — Martin Kleppmann
├── system-design-primer (GitHub)
└── Giải 2-3 system design problems mỗi tuần

Algorithms & Data Structures (nếu target FAANG):
├── Leetcode: 2-3 bài/ngày, pattern-based study
└── "Cracking the Coding Interview" — Gayle McDowell
```

**Short-term (3-6 tháng):**
```
Kubernetes:
├── Concepts: Pods, Deployments, Services, Ingress
├── Hands-on: Minikube local cluster
└── CKA certification (optional nhưng giá trị)

Go language:
├── Nhiều system-level services được viết bằng Go
├── "A Tour of Go" (interactive)
└── Build 1 microservice với Go, compare với NestJS

PostgreSQL depth:
└── Hầu hết enterprise dùng relational DB — biết cả SQL + NoSQL
```

**Long-term (6-12 tháng):**
```
Distributed Systems:
├── CAP theorem, eventual consistency
├── Consensus algorithms (Raft, Paxos — concepts)
└── MIT 6.824: Distributed Systems (free online)

Cloud (AWS/GCP/Azure):
├── AWS: EC2, RDS, ElastiCache, SQS, Lambda
├── Terraform: Infrastructure as Code
└── AWS Solutions Architect Associate certification
```

---

## Phần 3: Course Retrospective

### 3.1 Tổng kết hành trình 16 tuần

```
Stage 1: Foundations
Week 1: TypeScript + NestJS basics
Week 2: MongoDB + Mongoose
Week 3: Authentication + JWT
Week 4: Testing

Stage 2: Intermediate
Week 5: Caching + Redis
Week 6: Queues + Background Jobs
Week 7: Events + Event-Driven
Week 8: Microservices + gRPC

Stage 3: Advanced
Week 9: Observability + Monitoring
Week 10: Advanced Patterns (CQRS, Repository)
Week 11: Resilience (Circuit Breaker, Retry)
Week 12: Multi-tenancy + Advanced Auth

Stage 4: Production
Week 13: CI/CD + DevOps
Week 14: Security + OWASP
Week 15: Performance + System Design
Week 16: Capstone + Career
```

### 3.2 Key Lessons của Stage 4

**CI/CD:** "Không bao giờ deploy thứ bạn chưa build và test tự động."

**Security:** "Security must be applied exhaustively, not incrementally." — Case study `LocalAdapter.safePath()` nhắc nhở chúng ta rằng 1 method bị bỏ sót = toàn bộ defense vô nghĩa.

**Performance:** "Measure first, optimize second." — Profile trước khi code. p95 quan trọng hơn average.

**System Design:** "There are no right answers, only trade-offs."

### 3.3 Feedback Form

Sau khi hoàn thành course, vui lòng để lại feedback:

**Gửi email về [instructor email] với format:**

```
Subject: Feedback - nestjs-boot Course [Your name]

1. Tuần nào khó nhất? Tại sao?
2. Tuần nào hữu ích nhất cho career?
3. Nội dung gì bạn muốn được cover thêm?
4. Chất lượng hands-on exercises (1-10)?
5. Bạn sẽ recommend khóa này cho ai?
```

---

## Câu hỏi tự kiểm tra trước Demo Day

1. Bạn có thể giải thích tại sao chọn MongoDB thay vì PostgreSQL cho project này không?
2. JWT access token hết hạn sau 15 phút → user trải nghiệm thế nào? Refresh token flow như thế nào?
3. Nếu Redis bị down, cache-aside pattern của bạn fallback thế nào?
4. BullMQ job fail 3 lần → điều gì xảy ra? Bạn monitor failed jobs thế nào?
5. GitHub Actions pipeline của bạn fail ở bước nào hay nhất? Tại sao?
6. Endpoint nào của bạn chậm nhất? Đã đo bằng gì? Plan optimize thế nào?
7. Bạn sẽ scale project này lên 10x traffic thế nào?

---

## Đọc thêm & Resources

**Books:**
- *Designing Data-Intensive Applications* — Martin Kleppmann (must-read)
- *Clean Architecture* — Robert C. Martin
- *The Pragmatic Programmer* — Hunt & Thomas
- *Cracking the Coding Interview* — Gayle McDowell

**Online:**
- [NestJS Documentation](https://docs.nestjs.com)
- [System Design Primer](https://github.com/donnemartin/system-design-primer)
- [roadmap.sh/backend](https://roadmap.sh/backend)
- [ByteByteGo Newsletter](https://blog.bytebytego.com/)

**nestjs-boot:**
- `src/database/base.repository.ts` — pattern bạn nên copy vào capstone
- `src/auth/` — JWT implementation reference
- `src/storage/adapters/local.adapter.ts` — security patterns
- `examples/microservices/docker-compose.yml` — deployment reference
- `.github/workflows/ci.yml` — CI template

---

> **Lời kết:**
> 16 tuần vừa qua, bạn đã đi từ "TypeScript là gì" đến "ship production-ready backend với CI/CD, security, monitoring, và performance optimization."
>
> Nhưng học backend không bao giờ xong. Mỗi project mới, mỗi bug production, mỗi code review đều là bài học. Điều quan trọng không phải là biết tất cả, mà là **biết cách tìm ra câu trả lời** và **biết mình chưa biết gì**.
>
> Chúc mừng. Bây giờ bạn là backend engineer.
