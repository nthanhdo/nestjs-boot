# Lộ trình dạy Backend Engineering với nestjs-boot

> **Giảng viên:** Nguyễn Thanh Đô — Backend Tech Lead, 11+ năm kinh nghiệm
> **Đối tượng:** Sinh viên CNTT năm 3-4, fresher, junior developer
> **Thời lượng:** 16 tuần (1 buổi/tuần × 3 giờ) — có thể co giãn theo lớp
> **Triết lý:** Học từ production code thật, không học từ TODO app

---

## Tại sao dùng nestjs-boot để dạy?

- **Codebase thật** — 55+ modules, 495 tests, CI/CD, npm package. Không phải tutorial code
- **Phủ rộng** — từ REST API cơ bản đến CQRS, event sourcing, distributed tracing
- **Cấu trúc rõ** — mỗi module = 1 bài học, tách biệt, có test riêng
- **TypeScript** — static typing giúp sinh viên hiểu contract, interface, DI trước khi đụng Java/Go
- **Thực hành ngay** — `npx nestjs-boot new my-service` → chạy trong 30 giây

---

## Tổng quan 4 giai đoạn

| Giai đoạn | Tuần | Chủ đề | Mục tiêu |
|-----------|------|--------|----------|
| **Nền tảng** | 1–4 | TypeScript, NestJS core, REST API, Database | Sinh viên tự build được 1 CRUD API hoàn chỉnh |
| **Trung cấp** | 5–8 | Auth, Cache, Testing, Error handling | API có bảo mật, performance, và kiểm thử |
| **Nâng cao** | 9–12 | Microservices, Queue, Events, CQRS | Hiểu hệ thống phân tán, async processing |
| **Production** | 13–16 | CI/CD, Monitoring, Deploy, System design | Đưa được code lên production, biết debug |

---

## Giai đoạn 1: Nền tảng (Tuần 1–4)

### Tuần 1 — TypeScript & NestJS Fundamentals

**Lý thuyết:**
- Tại sao TypeScript? Type safety, interface, generics — so sánh với JavaScript thuần
- NestJS architecture: Module → Controller → Service → Repository
- Dependency Injection (DI) — tại sao quan trọng, so sánh với `new` trực tiếp
- Decorator pattern (`@Controller`, `@Get`, `@Injectable`)

**Thực hành:**
```bash
npx nestjs-boot new student-api --db=none --no-cache --no-auth
```
- Tạo 1 module `students` với CRUD endpoints
- Dùng DTO + class-validator để validate input
- Chạy thử với Postman / curl

**Bài tập về nhà:**
- Thêm module `courses` với quan hệ student ↔ course
- Viết 3 unit tests cho service

**Module nestjs-boot liên quan:** `src/config/`, `src/common/`, `src/contracts/`

---

### Tuần 2 — Database & Repository Pattern

**Lý thuyết:**
- SQL vs NoSQL — khi nào dùng gì
- MongoDB + Mongoose: Schema, Model, Connection
- Repository pattern — tách business logic khỏi data access
- BaseRepository: tại sao abstract class hữu ích

**Thực hành:**
```bash
npx nestjs-boot new student-db --db=mongodb
```
- Kết nối MongoDB (local Docker hoặc Atlas free)
- Tạo schema Student + Course
- Implement CRUD qua BaseRepository
- Query: filter, sort, pagination

**Bài tập về nhà:**
- Implement search với regex
- Thêm soft delete (isDeleted flag)

**Module nestjs-boot liên quan:** `src/database/` — đọc `base.repository.ts`, `connection.factory.ts`

---

### Tuần 3 — API Design & Validation

**Lý thuyết:**
- RESTful conventions: HTTP methods, status codes, resource naming
- Request lifecycle trong NestJS: Middleware → Guard → Interceptor → Pipe → Handler
- Validation: DTO + class-validator + class-transformer
- Error responses: Problem Details (RFC 7807)

**Thực hành:**
- Tạo DTOs với validation rules (`@IsString`, `@IsEmail`, `@Min`, `@Max`, `@ArrayMaxSize`)
- Global ValidationPipe
- Custom exception filter trả Problem Details format
- Pagination DTO (page, limit, sort)

**Bài tập về nhà:**
- Tạo API docs với Swagger decorators
- Implement bulk create endpoint với validation

**Module nestjs-boot liên quan:** `src/common/` (filters, interceptors, pipes), `src/swagger/`

---

### Tuần 4 — Config & Environment Management

**Lý thuyết:**
- 12-Factor App: config in environment, not in code
- `.env` files, `process.env`, config validation
- nestjs-boot config system: typed config, async loading, watcher
- Secrets management: tại sao không commit `.env`

**Thực hành:**
- Setup config module với schema validation (Joi hoặc class-validator)
- Multiple environments: `.env.development`, `.env.production`, `.env.test`
- Config watcher: hot-reload config không cần restart
- Tạo `createApp()` wrapper giống nestjs-boot

**Bài tập về nhà:**
- Tách database URL, port, JWT secret vào config
- Viết test verify config validation reject giá trị sai

**Module nestjs-boot liên quan:** `src/config/` — đọc toàn bộ, đặc biệt `config.module.ts`

**🏁 Milestone 1:** Nộp API hoàn chỉnh — CRUD + MongoDB + Validation + Config + Swagger docs

---

## Giai đoạn 2: Trung cấp (Tuần 5–8)

### Tuần 5 — Authentication & Authorization

**Lý thuyết:**
- Authentication vs Authorization
- JWT: header.payload.signature, tại sao stateless, trade-offs
- Password hashing: bcrypt, salt, timing attacks
- RBAC (Role-Based Access Control): roles, permissions, guards

**Thực hành:**
- Implement login/register với JWT
- Access token + Refresh token flow
- `@Roles('admin')` guard decorator
- API key authentication cho service-to-service

**Demo bảo mật (QUAN TRỌNG):**
- Decode JWT trên jwt.io — sinh viên thấy payload KHÔNG mã hóa
- Demo thiếu guard → ai cũng access được admin endpoint
- Demo token expire → tại sao cần refresh token

**Bài tập về nhà:**
- Implement "change password" endpoint
- Thêm rate limiting cho login (chống brute force)

**Module nestjs-boot liên quan:** `src/auth/` — `jwt.service.ts`, `jwt-auth.guard.ts`, `roles.guard.ts`, `api-key.guard.ts`

---

### Tuần 6 — Caching & Performance

**Lý thuyết:**
- Tại sao cần cache? Database bottleneck, network latency
- Cache strategies: cache-aside, write-through, write-behind
- TTL (Time-To-Live), cache invalidation — "2 hard problems in CS"
- L1 (in-memory) vs L2 (Redis) — khi nào dùng gì
- Cache stampede: thundering herd problem

**Thực hành:**
- Setup Redis (Docker)
- Implement cache-aside cho API get product list
- Benchmark trước/sau cache (dùng `autocannon` hoặc `k6`)
- Cache invalidation khi update/delete

**Demo performance:**
- 100 requests không cache → response time X ms
- 100 requests có cache → response time Y ms
- Sinh viên thấy **con số thật**, không phải lý thuyết

**Bài tập về nhà:**
- Implement cache tags (invalidate theo group)
- Xử lý cache stampede với mutex lock

**Module nestjs-boot liên quan:** `src/cache/` — `multi-cache.service.ts`, stampede guard, warming

---

### Tuần 7 — Testing

**Lý thuyết:**
- Testing pyramid: Unit → Integration → E2E
- Unit test: mock dependencies, test logic isolation
- Integration test: test với DB thật (testcontainers hoặc in-memory)
- TDD vs test-after: trade-offs thực tế

**Thực hành:**
- Viết unit tests cho service (mock repository)
- Viết integration tests cho controller (supertest)
- Test coverage report (`--coverage`)
- Test negative cases: invalid input, unauthorized, not found

**Bài tập về nhà:**
- Đạt 80% coverage cho 1 module
- Viết test cho edge case: concurrent update, race condition

**Module nestjs-boot liên quan:** `src/testing/` — `test-suite.ts`, `factories/`, test helpers

---

### Tuần 8 — Error Handling & Resilience

**Lý thuyết:**
- Error taxonomy: client errors (4xx) vs server errors (5xx)
- Global exception filter: catch-all, format response
- Retry pattern: transient vs permanent failures
- Circuit breaker: tại sao cần "ngắt mạch" khi downstream chết
- Graceful shutdown: tại sao `kill -9` là anti-pattern

**Thực hành:**
- Custom exception classes (BusinessException, ValidationException)
- Implement retry decorator
- Implement circuit breaker (3 fails → open → half-open → closed)
- Graceful shutdown: drain connections, finish queue jobs

**Bài tập về nhà:**
- Simulate database down → circuit breaker mở → fallback response
- Implement health check endpoint `/health`

**Module nestjs-boot liên quan:** `src/resilience/`, `src/health/`, `src/shutdown/`, `src/common/filters/`

**🏁 Milestone 2:** API có Auth + Cache + Tests + Error handling. Demo: login → CRUD → cache hit/miss → error fallback

---

## Giai đoạn 3: Nâng cao (Tuần 9–12)

### Tuần 9 — Microservices & Inter-service Communication

**Lý thuyết:**
- Monolith vs Microservices — khi nào tách, khi nào không
- Synchronous: REST, gRPC (so sánh performance, type safety)
- Asynchronous: message queue, event-driven
- Service discovery: làm sao service A tìm service B
- Correlation ID: trace request across services

**Thực hành:**
- Chạy example 10-service của nestjs-boot:
  ```bash
  cd examples/microservices && docker-compose up
  ```
- Gọi API Gateway → observe request chạy qua Auth → Product → Order
- Đọc code gRPC client/server
- Thêm correlation ID vào logs

**Bài tập về nhà:**
- Tạo 1 service mới (Notification) giao tiếp gRPC với Order service
- Log correlation ID end-to-end

**Module nestjs-boot liên quan:** `src/transport/`, `src/rpc/`, `src/correlation/`, `src/inter-service-auth/`

---

### Tuần 10 — Message Queue & Background Jobs

**Lý thuyết:**
- Tại sao async? Email, PDF gen, video processing — không nên block request
- Queue concepts: producer, consumer, job, worker, dead letter queue
- BullMQ + Redis: job types (delayed, repeated, prioritized)
- Idempotency: tại sao consumer phải xử lý duplicate
- Backpressure: khi producer nhanh hơn consumer

**Thực hành:**
- Setup BullMQ
- Create "send welcome email" job khi user register
- Implement worker với retry (3 attempts, exponential backoff)
- Dead letter queue cho failed jobs
- Bull Board UI để monitor jobs

**Bài tập về nhà:**
- Implement delayed job: "send reminder after 24h"
- Implement rate-limited job: max 10 emails/minute

**Module nestjs-boot liên quan:** `src/queue/` — decorators `@Processor`, `@Process`, auto-discovery

---

### Tuần 11 — Event-Driven Architecture & CQRS

**Lý thuyết:**
- Events vs Commands vs Queries
- Event Bus: publish/subscribe pattern
- CQRS: Command Query Responsibility Segregation — tại sao tách read/write
- Event Sourcing: store events, not state — trade-offs
- Saga pattern: distributed transactions without 2PC

**Thực hành:**
- Implement EventBus: `order.created` → notify + update inventory
- `@OnEvent('order.created')` decorator — auto-discovery
- CQRS: CreateOrderCommand → OrderCreatedEvent → UpdateInventoryHandler
- Event store: append-only log

**Bài tập về nhà:**
- Implement saga: Order → Payment → Fulfillment (compensating actions on failure)
- Event replay: rebuild read model from events

**Module nestjs-boot liên quan:** `src/events/`, `src/cqrs/` — EventBus, CommandBus, AggregateRoot, EventStore, Saga, Outbox

---

### Tuần 12 — Observability (Metrics, Logging, Tracing)

**Lý thuyết:**
- 3 pillars: Metrics (what), Logs (why), Traces (where)
- Prometheus + Grafana: counter, gauge, histogram
- Structured logging: JSON, log levels, context
- Distributed tracing: OpenTelemetry, spans, trace propagation
- Alerting: khi nào page engineer lúc 3 giờ sáng

**Thực hành:**
- Setup Prometheus + Grafana (Docker)
- Expose `/metrics` endpoint
- Custom metrics: request count, response time histogram, active connections
- Pino structured logging với correlation ID
- OpenTelemetry: trace request across 2 services

**Bài tập về nhà:**
- Tạo Grafana dashboard: request rate, error rate, p99 latency
- Setup alert: nếu error rate > 5% trong 5 phút → notification

**Module nestjs-boot liên quan:** `src/metrics/`, `src/logging/`, `src/tracing/`

**🏁 Milestone 3:** Hệ thống 3 services + queue + events + dashboard Grafana. Demo end-to-end flow có trace.

---

## Giai đoạn 4: Production (Tuần 13–16)

### Tuần 13 — CI/CD & DevOps

**Lý thuyết:**
- CI vs CD: continuous integration, continuous delivery/deployment
- Pipeline: lint → build → test → security scan → deploy
- Docker: container vs VM, Dockerfile best practices, multi-stage build
- Infrastructure as Code: docker-compose cho dev, K8s cho production

**Thực hành:**
- Viết Dockerfile multi-stage (builder + runner)
- docker-compose: app + MongoDB + Redis + Prometheus + Grafana
- GitHub Actions: CI pipeline (tham khảo `.github/workflows/ci.yml` của nestjs-boot)
- `npm audit` — security scan tự động

**Bài tập về nhà:**
- Setup CI cho project cá nhân
- Viết `docker-compose.prod.yml` (no volumes, env from secrets)

**Module nestjs-boot liên quan:** `.github/workflows/ci.yml`, `examples/microservices/docker-compose.yml`

---

### Tuần 14 — Security

**Lý thuyết:**
- OWASP Top 10: Injection, Broken Auth, XSS, SSRF, Mass Assignment...
- Path traversal: demo với nestjs-boot `LocalAdapter` bug (đã fix)
- SQL/NoSQL injection: parameterized queries vs string concat
- CORS, Helmet, rate limiting
- Dependency security: `npm audit`, Dependabot

**Thực hành (Capture-The-Flag style):**
- Cho sinh viên 1 API có lỗ hổng → tìm và exploit
- Path traversal: upload file với `../../../etc/passwd` key
- NoSQL injection: `{"username": {"$ne": ""}}` bypass auth
- Sửa từng lỗ hổng, viết test chứng minh đã fix

**Case study thật:**
- nestjs-boot P0-4: `upload()` thiếu `safePath()` — 1 dòng code = bảo mật hole
- Bài học: security helper phải apply **exhaustive**, không phải incremental

**Bài tập về nhà:**
- Audit API của mình theo OWASP checklist
- Viết negative tests: verify endpoint REJECT request xấu

**Module nestjs-boot liên quan:** `src/storage/adapters/local.adapter.ts` (trước/sau fix), `src/auth/guards/`

---

### Tuần 15 — Performance & System Design

**Lý thuyết:**
- N+1 query problem — demo + fix
- Database indexing: B-tree, compound index, explain plan
- Connection pooling: tại sao 1 connection per request = chết
- Load testing: K6/JMeter methodology
- Horizontal vs vertical scaling
- Reader/Writer split: read replicas

**Thực hành:**
- Profile API với `EXPLAIN ANALYZE` (MongoDB `.explain()`)
- Tìm N+1 query → fix bằng populate/lookup
- Thêm compound index → benchmark trước/sau
- Load test với K6: ramp 1→100 users, measure p50/p95/p99
- Reader/Writer split: writes → primary, reads → replica

**Bài tập về nhà:**
- Load test API của mình, viết báo cáo: bottleneck ở đâu, fix thế nào
- System design exercise: thiết kế URL shortener (whiteboard)

**Module nestjs-boot liên quan:** `src/database/` (reader/writer, connection factory), `src/cache/` (query caching)

---

### Tuần 16 — Capstone Project & Career Prep

**Capstone (tuần trước đã giao, tuần này demo):**

Mỗi nhóm 2-3 sinh viên build 1 hệ thống hoàn chỉnh:

| Yêu cầu | Chi tiết |
|----------|----------|
| Backend | NestJS, ≥3 modules, MongoDB |
| Auth | JWT + RBAC |
| Cache | Redis cache-aside |
| Queue | ≥1 background job |
| Testing | ≥70% coverage |
| CI | GitHub Actions pipeline green |
| Docs | Swagger + README |
| Deploy | Docker Compose chạy được |

**Gợi ý đề tài:**
- E-commerce: Product → Cart → Order → Payment → Notification
- Blog platform: Post → Comment → Like → Feed (timeline)
- Task management: Project → Board → Task → Assignment → Activity log
- Chat app: Room → Message → WebSocket real-time → notification queue

**Career prep (1 giờ cuối):**
- Cách viết CV backend engineer (demo CV thật)
- GitHub profile là portfolio — commit history, README, pinned repos
- System design interview: framework RESHADED (Requirements → Estimation → Storage → High-level → API → Detailed → Evaluation → Deployment)
- Contribute to open-source: fork nestjs-boot, fix 1 issue, mở PR

---

## Tài liệu & Tài nguyên

### Từ nestjs-boot repo
| Tài liệu | Dùng cho tuần |
|-----------|---------------|
| `README.md` | Tuần 1 — overview |
| `examples/microservices/` | Tuần 9 — microservices lab |
| `tests/` (82 suites) | Tuần 7 — testing patterns |
| `.github/workflows/ci.yml` | Tuần 13 — CI reference |
| `src/` module-by-module | Mỗi tuần — đọc production code |

### Sách khuyên đọc
- **Clean Code** (Robert C. Martin) — coding standards
- **Designing Data-Intensive Applications** (Martin Kleppmann) — system design bible
- **NestJS Documentation** (docs.nestjs.com) — official reference

### Tools sinh viên cần cài
- Node.js 20+, npm
- Docker Desktop
- Git + GitHub account
- VS Code + ESLint extension
- Postman hoặc Insomnia
- MongoDB Compass (GUI)
- Redis Insight (GUI)

---

## Đánh giá

| Thành phần | Tỷ trọng | Chi tiết |
|------------|----------|----------|
| Bài tập hàng tuần | 30% | Code + test, nộp qua GitHub |
| Milestone 1 (tuần 4) | 10% | CRUD API hoàn chỉnh |
| Milestone 2 (tuần 8) | 15% | Auth + Cache + Tests |
| Milestone 3 (tuần 12) | 15% | Microservices + Observability |
| Capstone (tuần 16) | 25% | Hệ thống hoàn chỉnh + demo |
| Tham gia lớp | 5% | Hỏi/trả lời, code review bạn |

---

## Nguyên tắc giảng dạy

1. **Code trước, lý thuyết sau** — sinh viên chạy code thấy kết quả trước, rồi mới giải thích tại sao
2. **Demo lỗi, không chỉ demo đúng** — show SQL injection thật, show crash thật → sinh viên nhớ lâu hơn
3. **Đọc production code** — mỗi tuần đọc 1 module của nestjs-boot, không chỉ viết tutorial code
4. **Review code nhau** — sinh viên PR vào repo chung, review code bạn trước khi merge
5. **Hỏi "tại sao" trước "làm thế nào"** — cache giải quyết vấn đề gì? Không dùng thì sao?
6. **Không skip security** — mọi API phải có guard, mọi input phải validate, mọi test phải có negative case
