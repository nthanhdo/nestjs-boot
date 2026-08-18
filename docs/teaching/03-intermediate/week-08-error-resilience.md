# Tuần 8: Error Handling & Resilience

> **Stage 2 — Intermediate | Tuần 8/8 — MILESTONE 2**
> Prerequisite: Tuần 5-7 hoàn thành

---

## Mục tiêu học tập

Sau bài này, bạn có thể:

1. Phân loại lỗi theo HTTP status code và biết khi nào dùng loại nào
2. Implement custom exception hierarchy với Problem Details (RFC 7807)
3. Cài đặt Retry với exponential backoff và Circuit Breaker pattern
4. Implement graceful shutdown — drain in-flight requests trước khi tắt
5. Viết health check endpoint cho Kubernetes readiness/liveness probes
6. Hoàn thành Milestone 2 Project

---

## 1. Error Taxonomy

### 1.1 Client Errors (4xx) — Lỗi của người dùng

Server xử lý đúng, nhưng request của client có vấn đề.

| Code | Tên | Dùng khi |
|------|-----|----------|
| 400 | Bad Request | Body không hợp lệ, missing field |
| 401 | Unauthorized | Chưa auth, token hết hạn |
| 403 | Forbidden | Auth OK nhưng không có quyền |
| 404 | Not Found | Resource không tồn tại |
| 409 | Conflict | Duplicate (email đã đăng ký) |
| 410 | Gone | Resource bị xóa vĩnh viễn |
| 422 | Unprocessable Entity | Body parse được nhưng logic sai |
| 429 | Too Many Requests | Rate limit exceeded |

### 1.2 Server Errors (5xx) — Lỗi của server

Server nhận được request hợp lệ nhưng không xử lý được.

| Code | Tên | Dùng khi |
|------|-----|----------|
| 500 | Internal Server Error | Unexpected error, bug |
| 502 | Bad Gateway | Upstream service trả về lỗi |
| 503 | Service Unavailable | Server overloaded, shutting down |
| 504 | Gateway Timeout | Upstream service không trả lời |

**Rule quan trọng:**
- **Đừng bao giờ trả 200 khi có lỗi** — client không biết phải xử lý thế nào
- **Đừng lộ stack trace** ra response cho production
- **5xx phải được alert** — 4xx thì không (trừ 429)

---

## 2. Exception Hierarchy

### 2.1 Vấn đề với flat error handling

```typescript
// ❌ Flat — không phân biệt được loại lỗi
throw new Error('Product not found')
throw new Error('Insufficient balance')
throw new Error('Payment service timeout')
// Tất cả đều là Error → catch cùng 1 cách → không biết phải làm gì
```

### 2.2 Custom Exception Hierarchy

```typescript
// Base exception — tất cả business exceptions kế thừa từ đây
export class BusinessException extends HttpException {
  constructor(
    message: string,
    statusCode: number,
    public readonly code: string,  // Machine-readable code
  ) {
    super({ message, code, statusCode }, statusCode)
  }
}

// Domain-specific exceptions
export class OrderNotFoundException extends BusinessException {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`, 404, 'ORDER_NOT_FOUND')
  }
}

export class InsufficientFundsException extends BusinessException {
  constructor(required: number, available: number) {
    super(
      `Insufficient funds: required ${required}, available ${available}`,
      422,
      'INSUFFICIENT_FUNDS',
    )
  }
}

export class PaymentServiceUnavailableException extends BusinessException {
  constructor() {
    super('Payment service is temporarily unavailable', 503, 'PAYMENT_SERVICE_DOWN')
  }
}
```

**Tại sao hierarchy tốt hơn flat:**
```typescript
// Catch cụ thể → xử lý đúng
try {
  await paymentService.charge(amount)
} catch (error) {
  if (error instanceof InsufficientFundsException) {
    // Thông báo cho user
    return { canRetry: false, message: 'Vui lòng nạp thêm tiền' }
  }
  if (error instanceof PaymentServiceUnavailableException) {
    // Retry sau
    return { canRetry: true, retryAfter: 60 }
  }
  throw error  // Unknown error → re-throw
}
```

### 2.3 Problem Details — RFC 7807

Standard format cho error response — được nhiều framework/client tự parse được.

```typescript
// RFC 7807 format
{
  "type": "https://api.example.com/errors/ORDER_NOT_FOUND",
  "title": "Order Not Found",
  "status": 404,
  "detail": "Order abc-123 does not exist or has been deleted",
  "instance": "/orders/abc-123",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"   // Correlation ID
}
```

**NestJS Exception Filter:**

```typescript
// problem-details.filter.ts
@Catch()
@Injectable()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = 500
    let code = 'INTERNAL_SERVER_ERROR'
    let detail = 'An unexpected error occurred'

    if (exception instanceof BusinessException) {
      status = exception.getStatus()
      code = exception.code
      detail = exception.message
    } else if (exception instanceof HttpException) {
      status = exception.getStatus()
      detail = exception.message
    }

    // Không lộ internal error details trong production
    if (status === 500 && process.env.NODE_ENV === 'production') {
      detail = 'An unexpected error occurred'
    }

    response.status(status).json({
      type: `https://api.example.com/errors/${code}`,
      title: code.replace(/_/g, ' ').toLowerCase(),
      status,
      detail,
      instance: request.url,
      traceId: request.headers['x-trace-id'] ?? 'no-trace',
    })
  }
}

// main.ts — apply globally
app.useGlobalFilters(new ProblemDetailsFilter())
```

---

## 3. Retry Pattern

### 3.1 Transient vs Permanent Failures

```
Transient (tạm thời) — nên retry:
- Network timeout
- Service momentarily unavailable (503)
- Connection reset
- Rate limit (429) — sau delay

Permanent — KHÔNG retry:
- 401 Unauthorized (token hết hạn → cần refresh, không phải retry)
- 404 Not Found (resource không tồn tại)
- 400 Bad Request (request sai → retry cũng sai)
- 422 Unprocessable Entity
```

### 3.2 @Retry Decorator từ nestjs-boot

```typescript
// src/resilience/retry.decorator.ts
export function Retry(options?: RetryOptions): MethodDecorator {
  // maxAttempts: số lần thử tối đa (bao gồm lần đầu)
  // backoff: 'fixed' | 'exponential'
  // delay: base delay (ms)
  // maxDelay: cap delay (ms)
  // retryOn: predicate để quyết định retry hay không
}
```

**Exponential backoff với jitter:**

```
Attempt 1 fails → wait 1s
Attempt 2 fails → wait 2s + random(0, 0.5s)
Attempt 3 fails → wait 4s + random(0, 2s)
Attempt 4 fails → wait 8s + random(0, 4s)  (capped at maxDelay)
```

Tại sao cần **jitter** (randomness)? Không có jitter: 100 clients đều retry cùng lúc sau 2 giây → stampede mới. Có jitter → phân tán.

**Dùng trong code:**

```typescript
@Injectable()
export class OrderService {

  @Retry({
    maxAttempts: 3,
    backoff: 'exponential',
    delay: 1000,          // 1s base
    maxDelay: 10000,      // max 10s
    retryOn: (error) => {
      // Chỉ retry transient errors
      if (error instanceof InsufficientFundsException) return false  // Permanent
      if (error instanceof OrderNotFoundException) return false       // Permanent
      return true  // Retry mọi lỗi khác (timeout, 503...)
    },
  })
  async processPayment(orderId: string, amount: number): Promise<PaymentResult> {
    return this.paymentClient.charge({ orderId, amount })
  }
}
```

### 3.3 Retry từ nguồn nestjs-boot

```typescript
// src/resilience/retry.decorator.ts (core logic)
function computeDelay(attempt, backoff, baseDelay, maxDelay): number {
  if (backoff === 'fixed') return Math.min(baseDelay, maxDelay)
  
  // Exponential với jitter
  const exponential = baseDelay * Math.pow(2, attempt)
  const jitter = Math.random() * (baseDelay / 2)
  return Math.min(exponential + jitter, maxDelay)
}

// Decorator wraps method:
descriptor.value = async function (...args) {
  let lastError: Error
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await originalMethod.apply(this, args)
    } catch (error) {
      lastError = error
      if (retryOn && !retryOn(lastError)) throw lastError  // Permanent → không retry
      if (attempt < maxAttempts - 1) {
        const waitTime = computeDelay(attempt, backoff, delay, maxDelay)
        await sleep(waitTime)
      }
    }
  }
  throw lastError
}
```

---

## 4. Circuit Breaker

### 4.1 Analogy: Cầu dao điện

> Khi có chập điện, cầu dao tự nhảy — ngắt mạch để bảo vệ thiết bị. Sau khi sửa, bạn bật lại. Nếu chập tiếp → cầu dao nhảy lại.

Circuit Breaker trong software:
- **CLOSED (bình thường):** Mọi request pass qua
- **OPEN (sự cố):** Ngắt mạch — reject request ngay lập tức, không thử downstream
- **HALF_OPEN (phục hồi):** Thử 1 vài request xem downstream đã ổn chưa

### 4.2 State Machine

```
                  failureThreshold reached
    CLOSED ─────────────────────────────────▶ OPEN
       ▲                                        │
       │  success in HALF_OPEN              resetTimeout
       │                                     elapsed
       │                                        │
    HALF_OPEN ◀─────────────────────────────────┘
       │
       │  failure in HALF_OPEN
       └─────────────────────────────────────▶ OPEN
```

### 4.3 CircuitBreaker từ nestjs-boot source

```typescript
// src/resilience/circuit-breaker.ts
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED'
  private failureCount = 0
  private halfOpenAttempts = 0
  private nextAttemptTime = 0

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5     // Default: 5 failures
    this.resetTimeout = options.resetTimeout ?? 30000          // Default: 30s
    this.halfOpenMax = options.halfOpenMax ?? 1                // Default: 1 probe request
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // OPEN state check
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo('HALF_OPEN')   // Time to probe
      } else {
        throw new CircuitBreakerOpenError()   // Fast-fail!
      }
    }

    // HALF_OPEN: limit probe requests
    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.halfOpenMax) {
      throw new CircuitBreakerOpenError('half-open limit reached')
    }

    try {
      if (this.state === 'HALF_OPEN') this.halfOpenAttempts++
      const result = await fn()
      this.onSuccess()    // → CLOSED if HALF_OPEN
      return result
    } catch (error) {
      this.onFailure()    // → OPEN if threshold reached
      throw error
    }
  }
}
```

**Xem test thực trong source** — `tests/resilience/circuit-breaker.spec.ts`:

```typescript
it('rejects immediately when OPEN', async () => {
  // Force OPEN: 3 failures với threshold=3
  for (let i = 0; i < 3; i++) {
    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {})
  }
  expect(cb.getState()).toBe('OPEN')

  // Fast-fail: không gọi fn, throw ngay
  await expect(cb.execute(() => Promise.resolve('ok')))
    .rejects.toThrow(CircuitBreakerOpenError)
})
```

### 4.4 @CircuitBreaker Decorator

```typescript
// src/resilience/circuit-breaker.decorator.ts
@Injectable()
export class PaymentService {
  @CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60_000,  // 60 giây trước khi thử lại
    name: 'payment-gateway',
  })
  async chargeCard(amount: number): Promise<ChargeResult> {
    return this.paymentGateway.charge(amount)
  }
}
```

**Khi nào Circuit Breaker bảo vệ bạn:**

```
Scenario: Payment service đang down

Không có CB:                         Có CB:
Request 1 → timeout 30s              Request 1 → timeout → fail++
Request 2 → timeout 30s              Request 2 → timeout → fail++
...                                  ...
Request 100 → timeout 30s            Request 5 → threshold! → OPEN
→ 100 threads blocked 30s            Request 6-100 → fast-fail (<1ms)
→ Thread pool exhausted              → Other features still work!
→ Toàn bộ app bị block              → Payment temporarily disabled
```

---

## 5. Timeout Pattern

### 5.1 Unbounded requests = system killer

```typescript
// ❌ Không có timeout — nếu DB slow query 5 phút
const result = await this.db.findAll()
// Thread bị block 5 phút → thread pool cạn → app unresponsive
```

### 5.2 TimeoutInterceptor từ nestjs-boot

```typescript
// src/resilience/timeout.interceptor.ts
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeout: number

  constructor(
    private readonly reflector: Reflector,
    resilienceOptions?: ResilienceOptions,
  ) {
    this.defaultTimeout = resilienceOptions?.timeout?.default ?? 30_000  // 30s default
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Per-route override với @Timeout(ms)
    const routeTimeout = this.reflector.get<number>(TIMEOUT_KEY, context.getHandler())
    const ms = routeTimeout ?? this.defaultTimeout

    return next.handle().pipe(
      timeout(ms),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException(`Request timed out after ${ms}ms`))
        }
        return throwError(() => err)
      }),
    )
  }
}
```

**Dùng trong controller:**

```typescript
@Controller('reports')
@UseInterceptors(TimeoutInterceptor)
export class ReportsController {

  @Get('quick')
  @Timeout(5_000)         // Override: 5 giây cho route này
  getQuickReport() { ... }

  @Get('heavy')
  @Timeout(120_000)       // 2 phút cho heavy computation
  getHeavyReport() { ... }
}

// main.ts — global timeout
app.useGlobalInterceptors(
  new TimeoutInterceptor(reflector, { timeout: { default: 30_000 } })
)
```

---

## 6. Bulkhead Pattern

Isolate failure domains — nếu 1 feature fail, không ảnh hưởng feature khác.

```typescript
// Thay vì dùng chung 1 DB connection pool
// → Mỗi critical domain có pool riêng

// payments-db.module.ts
MongooseModule.forRoot(process.env.PAYMENTS_MONGO_URI, {
  connectionName: 'payments',
  maxPoolSize: 10,  // Pool riêng cho payments
})

// catalog-db.module.ts
MongooseModule.forRoot(process.env.CATALOG_MONGO_URI, {
  connectionName: 'catalog',
  maxPoolSize: 20,  // Pool riêng cho catalog
})

// Nếu payments DB quá tải → chỉ payments feature bị ảnh hưởng
// Catalog vẫn chạy bình thường với pool của nó
```

---

## 7. Graceful Shutdown

### 7.1 Vấn đề khi shutdown thô

```
Scenario: Deploy mới → Kubernetes gửi SIGTERM

❌ Không có graceful shutdown:
SIGTERM → process.exit() ngay lập tức
→ 50 requests đang xử lý bị cut → client nhận connection reset
→ Database transactions in-flight bị rollback
→ User thấy lỗi 500
```

### 7.2 ShutdownService từ nestjs-boot

```typescript
// src/shutdown/shutdown.service.ts
@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutdown signal: ${signal}`)
    this.shuttingDownFlag = true  // Health check sẽ return 503

    // Phase 1: Custom pre-shutdown hook
    if (this.beforeShutdownHook) {
      await this.beforeShutdownHook()  // e.g., stop processing new jobs
    }

    // Phase 2: Stop accepting new connections + drain in-flight
    const server = httpAdapter.getHttpServer()
    await new Promise<void>((resolve) => {
      server.close(resolve)  // Đợi in-flight requests finish
    })

    // Node 18.2+: Close keep-alive connections
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections()
    }

    this.logger.log(`Shutdown complete`)
  }
}
```

**Sequence đúng:**

```
SIGTERM received
    │
    ▼ (immediate)
shuttingDownFlag = true
    │
    ▼ (health → 503)
K8s removes pod from load balancer
    │
    ▼ (drain window, e.g., 30s)
server.close() — no new connections accepted
    │
    ▼ (wait for in-flight)
All in-flight requests complete (or timeout)
    │
    ▼
process.exit(0)
```

### 7.3 Kubernetes preStop hook

```yaml
# deployment.yaml
spec:
  containers:
  - name: api
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sleep", "5"]  # Wait 5s for LB to remove pod
    env:
    - name: BOOT_PRESTOP_DELAY_MS
      value: "5000"
```

ShutdownService tự detect K8s environment:
```typescript
// src/shutdown/shutdown.service.ts
export function isKubernetesEnvironment(): boolean {
  return typeof process.env.KUBERNETES_SERVICE_HOST === 'string'
}

export function getK8sPreStopDelay(): number {
  return parseInt(process.env.BOOT_PRESTOP_DELAY_MS ?? '5000', 10)
}
```

---

## 8. Health Checks

### 8.1 Liveness vs Readiness Probes

| Probe | Hỏi | Action khi fail |
|-------|-----|----------------|
| **Liveness** | "App còn sống không?" | Kubernetes restart pod |
| **Readiness** | "App sẵn sàng nhận traffic không?" | Remove from load balancer |

```yaml
# deployment.yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### 8.2 HealthController từ nestjs-boot

```typescript
// src/health/health.controller.ts
@Controller()
export class HealthController {
  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    // Return 503 during shutdown → K8s readiness probe fails
    // → Pod removed from LB before draining
    if (this.shutdownService?.isShuttingDownNow()) {
      throw new ServiceUnavailableException('Service is shutting down')
    }

    const checks: HealthIndicatorFunction[] = []

    if (this.dbIndicator) {
      checks.push(() => this.dbIndicator!.isHealthy())    // MongoDB ping
    }
    if (this.redisIndicator) {
      checks.push(() => this.redisIndicator!.isHealthy()) // Redis ping
    }

    return this.health.check(checks)
  }
}
```

**Response format:**

```json
// 200 — Healthy
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}

// 503 — Unhealthy
{
  "status": "error",
  "error": {
    "database": { "status": "down", "message": "Connection timeout" }
  }
}
```

---

## 9. Hands-on: Full Resilience Stack

### Step 1: Setup

```bash
npm install @nestjs/terminus
```

### Step 2: Custom Exceptions

```typescript
// exceptions/index.ts
export class BusinessException extends HttpException {
  constructor(message: string, status: number, public readonly code: string) {
    super({ message, code, status }, status)
  }
}

export class ProductNotFoundException extends BusinessException {
  constructor(id: string) {
    super(`Product ${id} not found`, 404, 'PRODUCT_NOT_FOUND')
  }
}

export class OutOfStockException extends BusinessException {
  constructor(productId: string) {
    super(`Product ${productId} is out of stock`, 422, 'OUT_OF_STOCK')
  }
}
```

### Step 3: Global Exception Filter

```typescript
// main.ts
app.useGlobalFilters(new ProblemDetailsFilter())
```

### Step 4: Resilient Service

```typescript
@Injectable()
export class InventoryService {
  private readonly cb = new CircuitBreaker({
    name: 'inventory-db',
    failureThreshold: 5,
    resetTimeout: 30_000,
  })

  @Retry({ maxAttempts: 3, backoff: 'exponential', delay: 500 })
  async checkStock(productId: string): Promise<number> {
    return this.cb.execute(async () => {
      const item = await this.inventoryModel.findOne({ productId })
      if (!item) throw new ProductNotFoundException(productId)
      return item.quantity
    })
  }

  async reserve(productId: string, quantity: number): Promise<void> {
    const stock = await this.checkStock(productId)
    if (stock < quantity) throw new OutOfStockException(productId)
    await this.inventoryModel.updateOne(
      { productId },
      { $inc: { quantity: -quantity } },
    )
  }
}
```

### Step 5: Health Endpoint

```typescript
// app.module.ts
BootHealthModule.register({
  path: '/health',
  database: true,   // MongoDB indicator
  redis: true,      // Redis indicator
})
```

### Step 6: Graceful Shutdown

```typescript
// main.ts
app.enableShutdownHooks()  // Bật NestJS shutdown hooks

BootShutdownModule.register({
  timeout: 30_000,
  signals: ['SIGTERM', 'SIGINT'],
  beforeShutdown: async () => {
    // Stop background jobs, close message queue connections...
  },
})
```

---

## 10. Bài tập — Milestone 2 Project

### Mô tả

Build một **Order Processing Service** với full resilience stack.

### Requirements

**API Endpoints:**
```
POST /orders              → Create order (check inventory → charge payment → confirm)
GET  /orders/:id          → Get order by ID (cached, 60s TTL)
GET  /health              → Health check (DB + Redis)
```

**Resilience requirements:**
1. Payment service call → `@Retry(3, exponential)` + `CircuitBreaker(threshold=5)`
2. Inventory check → `CircuitBreaker` độc lập
3. Request timeout toàn bộ: 30s global, 60s cho heavy routes
4. Graceful shutdown: drain in-flight trước khi exit
5. Custom exception hierarchy: `OrderException > OutOfStockException, PaymentFailedException`
6. Problem Details error format (RFC 7807)
7. Cache: `GET /orders/:id` dùng `MultiCacheService.getOrSet()`

**Test requirements:**
- Unit tests: OrderService với mocked dependencies
- Integration test: `POST /orders` happy path + payment failure scenario
- Coverage ≥ 80%

### Bài tập phụ: Simulate Downstream Failure

```bash
# 1. Start app
npm run start:dev

# 2. Simulate payment service down (env variable)
PAYMENT_SERVICE_URL=http://localhost:9999  # non-existent port

# 3. Send 10 requests
for i in $(seq 1 10); do
  curl -X POST http://localhost:3000/orders \
    -H "Content-Type: application/json" \
    -d '{"productId":"123","quantity":1}'
  echo ""
done

# Observe:
# Request 1-5: Retry 3x → fail → CircuitBreaker counts failure
# Request 6+: CircuitBreakerOpenError ngay lập tức (fast-fail)
# Check logs: "Circuit breaker: CLOSED → OPEN"
```

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| 500 lộ stack trace | Không có Exception Filter | Apply ProblemDetailsFilter globally |
| CircuitBreaker không open | failureThreshold quá cao hoặc errors không được catch | Log failure count, check error propagation |
| Graceful shutdown không drain | `enableShutdownHooks()` bị bỏ quên | Thêm vào `main.ts` |
| Health check luôn 200 kể cả DB down | Indicator không throw | Verify indicator logic |
| Retry vô hạn với 4xx errors | `retryOn` không filter permanent errors | Thêm check: nếu `error instanceof HttpException && status < 500` → không retry |
| SIGTERM không trigger shutdown | `enableShutdownHooks()` chưa gọi | Phải gọi TRƯỚC `app.listen()` |

---

## Câu hỏi tự kiểm tra

1. Khác nhau giữa 401 và 403 là gì? Cho ví dụ cụ thể.
2. Circuit Breaker OPEN → HALF_OPEN xảy ra sau bao lâu? Ai quyết định?
3. Tại sao `@Retry` không nên retry 401 error?
4. `server.close()` vs `server.closeAllConnections()` — khác nhau gì? Cái nào cần trong graceful shutdown?
5. Liveness probe vs Readiness probe — Kubernetes xử lý failure khác nhau thế nào?

---

## Đọc thêm

- [RFC 7807 — Problem Details for HTTP APIs](https://tools.ietf.org/html/rfc7807)
- [Martin Fowler — Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Retry pattern — Azure Architecture](https://docs.microsoft.com/en-us/azure/architecture/patterns/retry)
- [Graceful shutdown — Node.js best practices](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)
- Source: `src/resilience/circuit-breaker.ts`, `src/resilience/retry.decorator.ts`, `src/resilience/timeout.interceptor.ts`
- Source: `src/shutdown/shutdown.service.ts`, `src/health/health.controller.ts`
- Tests: `tests/resilience/circuit-breaker.spec.ts`, `tests/resilience/retry.spec.ts`

---

## Milestone 2 — Checklist

Trước khi nộp, verify:

- [ ] `POST /orders` với valid input → 201
- [ ] `POST /orders` khi payment service down → Circuit breaker log + 503
- [ ] `GET /orders/:id` lần 1 → DB query, lần 2 → cache hit
- [ ] `GET /health` → 200 với DB + Redis status
- [ ] Kill app bằng `Ctrl+C` → log "Shutdown complete" → không có 500 errors trong logs
- [ ] `npx vitest run --coverage` → ≥ 80%
- [ ] Error responses đúng RFC 7807 format
- [ ] Không có stack trace trong production error responses
