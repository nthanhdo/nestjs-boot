# Tuần 7: Testing

> **Stage 2 — Intermediate | Tuần 7/8**
> Prerequisite: Tuần 5-6 hoàn thành

---

## Mục tiêu học tập

Sau bài này, bạn có thể:

1. Giải thích Testing Pyramid và trade-offs giữa Unit/Integration/E2E
2. Viết Unit Tests với Vitest — mock dependencies, test behavior
3. Viết Integration Tests với supertest + test database
4. Dùng test helpers từ `nestjs-boot/testing` để giảm boilerplate
5. Generate coverage report và hiểu 80% có nghĩa gì
6. Áp dụng TDD cho feature nhỏ

---

## 1. Tại sao Test?

### 1.1 "It works on my machine"

Câu chuyện thực tế (xảy ra ở mọi team):

```
Thứ 2: Dev A implement feature "tính giảm giá theo role"
Thứ 3: Dev A test local → OK → merge
Thứ 4: Deploy production
Thứ 5: Khách hàng VIP báo lỗi: giảm giá sai
Thứ 5: Team debug 3 tiếng → tìm ra: logic đúng nhưng chỉ khi role là string
         Production DB lưu role là string[], không phải string
Thứ 5 tối: Hotfix deploy, apologize khách hàng
```

**Nếu có test:**
```
Thứ 3: Unit test "user có role VIP → discount 20%" chạy
        Test fail vì dev test với string, nhưng function nhận string[]
Thứ 3: Fix trong 5 phút trước khi merge
```

### 1.2 Tests là documentation sống

```typescript
// Đây là spec của function — không cần đọc implementation
describe('calculateDiscount', () => {
  it('VIP user gets 20% discount')
  it('Regular user gets 0% discount')
  it('throws when discount > 100%')
  it('handles zero price correctly')
})
```

Đọc test → hiểu behavior → không cần comment.

---

## 2. Testing Pyramid

```
        /\
       /  \
      / E2E\          Ít test, chạy chậm, tốn kém
     /──────\         Kiểm tra: whole user journey
    /  Integ  \       
   /────────────\     Vừa phải, DB thật, HTTP thật
  /  Unit Tests  \    Nhiều test, chạy nhanh, isolate
 /────────────────\   
```

### 2.1 Unit Tests

**Mục tiêu:** Test 1 function/class trong isolation, mock mọi dependency.

```
Speed:      ⚡⚡⚡⚡⚡ (ms per test)
Confidence: ★★★☆☆ (only tests logic, not integration)
Cost:       💰 (cheap to write, maintain)
```

**Test gì:**
- Business logic: tính toán, validation, transformation
- Error cases, edge cases
- Service methods (mock DB)

### 2.2 Integration Tests

**Mục tiêu:** Test nhiều components cùng nhau với real infrastructure.

```
Speed:      ⚡⚡⚡ (seconds per test)
Confidence: ★★★★☆ (tests real interactions)
Cost:       💰💰 (need test DB, more setup)
```

**Test gì:**
- HTTP endpoints (supertest)
- DB operations (test database)
- Auth flow end-to-end

### 2.3 E2E Tests

**Mục tiêu:** Test whole user journey từ browser/client đến DB.

```
Speed:      ⚡ (minutes)
Confidence: ★★★★★ (most realistic)
Cost:       💰💰💰 (expensive, flaky, slow feedback)
```

**Rule of thumb:** 70% Unit / 20% Integration / 10% E2E

---

## 3. Unit Testing với Vitest

nestjs-boot dùng **Vitest** (không phải Jest) — API giống Jest nhưng nhanh hơn với ES modules.

### 3.1 Cấu trúc test file

```typescript
// products.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('ProductsService', () => {
  // Setup chạy trước mỗi test
  beforeEach(() => {
    vi.clearAllMocks()    // Reset mocks
  })

  describe('findById', () => {
    it('returns product when found', async () => {
      // Arrange — setup input và expected
      // Act — gọi function
      // Assert — verify kết quả
    })

    it('throws NotFoundException when product not found', async () => {
      // ...
    })
  })
})
```

### 3.2 Arrange-Act-Assert Pattern

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { ProductsService } from './products.service'

describe('ProductsService', () => {
  let service: ProductsService
  let mockProductModel: any
  let mockCache: any

  beforeEach(() => {
    // Arrange (shared setup) — mock dependencies
    mockProductModel = {
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      create: vi.fn(),
    }
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      getOrSet: vi.fn(),
    }

    service = new ProductsService(mockCache, mockProductModel)
  })

  it('findById returns cached product on cache hit', async () => {
    // Arrange
    const cachedProduct = { id: '123', name: 'iPhone', price: 999 }
    mockCache.getOrSet.mockImplementation(
      async (key: string, factory: () => Promise<any>) => {
        // Simulate cache hit — don't call factory
        return cachedProduct
      },
    )

    // Act
    const result = await service.findById('123')

    // Assert
    expect(result).toEqual(cachedProduct)
    expect(mockProductModel.findById).not.toHaveBeenCalled()  // DB không được gọi!
  })

  it('findById queries DB on cache miss', async () => {
    // Arrange
    const dbProduct = { id: '123', name: 'iPhone', price: 999 }
    mockCache.getOrSet.mockImplementation(
      async (key: string, factory: () => Promise<any>) => {
        return factory()  // Simulate cache miss — call factory
      },
    )
    mockProductModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(dbProduct),
    })

    // Act
    const result = await service.findById('123')

    // Assert
    expect(result).toEqual(dbProduct)
    expect(mockProductModel.findById).toHaveBeenCalledWith('123')
  })

  it('findById throws NotFoundException when product not found', async () => {
    // Arrange
    mockCache.getOrSet.mockImplementation(
      async (key: string, factory: () => Promise<any>) => factory(),
    )
    mockProductModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    })

    // Act & Assert
    await expect(service.findById('not-exist')).rejects.toThrow(NotFoundException)
  })
})
```

### 3.3 Mocking Strategies

**vi.fn() — mock a function:**
```typescript
const mockFn = vi.fn()
mockFn.mockReturnValue('hello')          // return static value
mockFn.mockResolvedValue('async hello')  // return Promise
mockFn.mockRejectedValue(new Error('fail'))  // reject Promise
mockFn.mockImplementation((arg) => arg.toUpperCase())  // custom logic

// Verify calls
expect(mockFn).toHaveBeenCalledTimes(1)
expect(mockFn).toHaveBeenCalledWith('expected-arg')
expect(mockFn).not.toHaveBeenCalled()
```

**vi.spyOn() — wrap existing method:**
```typescript
const logger = new Logger('test')
const spy = vi.spyOn(logger, 'error')

// Run code that calls logger.error
service.doSomethingThatLogs()

// Verify it was called
expect(spy).toHaveBeenCalledWith(expect.stringContaining('error message'))
```

### 3.4 Testing từ nestjs-boot source

Xem `tests/auth/jwt.service.spec.ts` — đây là unit test hoàn chỉnh:

```typescript
// tests/auth/jwt.service.spec.ts
import { describe, it, expect } from 'vitest'
import * as jwt from 'jsonwebtoken'
import { BootJwtService } from '../../src/auth/services/jwt.service'

// Helper: tạo service không cần NestJS DI container
function createService(opts: { secret: string; refreshSecret?: string }) {
  return new BootJwtService({
    jwt: {
      secret: opts.secret,
      refreshSecret: opts.refreshSecret,
    },
  })
}

describe('BootJwtService', () => {
  const secret = 'test-secret-key-min8'
  const refreshSecret = 'refresh-secret-key-min8'

  it('sign creates a valid JWT', () => {
    const service = createService({ secret })
    const token = service.sign({ sub: '123', role: 'admin' })

    // Verify bằng jsonwebtoken trực tiếp (không qua service)
    const decoded = jwt.verify(token, secret) as Record<string, any>
    expect(decoded.sub).toBe('123')
    expect(decoded.role).toBe('admin')
  })

  it('verify throws on invalid token', () => {
    const service = createService({ secret })
    expect(() => service.verify('invalid.token.here')).toThrow()
  })

  it('refresh token uses separate secret', () => {
    const service = createService({ secret, refreshSecret })
    const token = service.signRefresh({ sub: '456' })

    // OK với refresh secret
    const decoded = service.verifyRefresh(token)
    expect(decoded.sub).toBe('456')

    // Fail với main secret ← critical security check!
    expect(() => jwt.verify(token, secret)).toThrow()
  })
})
```

**Bài học từ source này:**
1. Không cần NestJS DI container cho unit test — construct trực tiếp
2. Test negative cases (invalid token, wrong secret)
3. Cross-verify: dùng `jwt.verify` trực tiếp để kiểm tra service behavior

---

## 4. Integration Tests

### 4.1 Setup với createTestApp

nestjs-boot cung cấp `createTestApp` helper:

```typescript
// src/testing/integration/create-test-app.ts (đơn giản hóa)
export async function createTestApp(options: CreateTestAppOptions): Promise<TestAppContext> {
  const module = await Test.createTestingModule({
    imports: options.imports ?? [],
    providers: options.providers ?? [],
  }).compile()

  const app = module.createNestApplication()
  await app.init()
  
  return { app, module }
}
```

### 4.2 HTTP Integration Test với supertest

```typescript
// products.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as request from 'supertest'
import { createTestApp, createTestJwt, cleanDatabase } from 'nestjs-boot/testing'
import { AppModule } from '../src/app.module'

describe('Products API', () => {
  let app: any
  let authToken: string

  beforeAll(async () => {
    // Tạo test app với test DB
    const ctx = await createTestApp({
      imports: [AppModule],
    })
    app = ctx.app.getHttpServer()

    // Tạo JWT token cho test (không cần real login)
    authToken = createTestJwt(
      { sub: 'test-user-id', email: 'test@example.com', roles: ['admin'] },
      { secret: process.env.JWT_SECRET }
    )
  })

  afterAll(async () => {
    await cleanDatabase(/* db connection */)
    await app.close()
  })

  it('GET /products → 200 with array', async () => {
    const response = await request(app)
      .get('/products')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)

    expect(Array.isArray(response.body)).toBe(true)
  })

  it('GET /products → 401 without token', async () => {
    await request(app)
      .get('/products')
      .expect(401)
  })

  it('POST /products → 201 with valid body', async () => {
    const dto = { name: 'Test Product', price: 99.99, category: 'electronics' }

    const response = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${authToken}`)
      .send(dto)
      .expect(201)

    expect(response.body).toMatchObject({
      name: 'Test Product',
      price: 99.99,
    })
    expect(response.body.id).toBeDefined()
  })

  it('POST /products → 400 with missing required field', async () => {
    const invalidDto = { price: 99.99 }  // missing name

    const response = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${authToken}`)
      .send(invalidDto)
      .expect(400)

    expect(response.body.message).toContain('name')  // Validation error
  })
})
```

### 4.3 MockAuthModule — bỏ qua auth khi không cần test

```typescript
// Từ src/testing/auth/index.ts
import { MockAuthModule } from 'nestjs-boot/testing'

const ctx = await createTestApp({
  imports: [
    MockAuthModule.register({ sub: 'test-user', roles: ['admin'] }),
    ProductsModule,  // Module cần test
  ],
})
// Tất cả requests đều authenticated tự động — không cần set Authorization header
```

### 4.4 Xem test thực từ source

```typescript
// tests/resilience/circuit-breaker.spec.ts — pattern tốt
describe('CircuitBreaker', () => {
  let cb: CircuitBreaker

  // beforeEach: fresh instance cho mỗi test — không share state
  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 100, halfOpenMax: 1 })
  })

  it('opens after threshold failures', async () => {
    const fail = () => cb.execute(() => Promise.reject(new Error('fail')))
    
    // 2 failures → still CLOSED
    await expect(fail()).rejects.toThrow('fail')
    await expect(fail()).rejects.toThrow('fail')
    expect(cb.getState()).toBe('CLOSED')
    
    // 3rd failure → OPEN
    await expect(fail()).rejects.toThrow('fail')
    expect(cb.getState()).toBe('OPEN')
  })

  it('transitions to HALF_OPEN after resetTimeout', async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {})
    }
    
    // Wait for reset
    await new Promise((r) => setTimeout(r, 150))
    
    // Now succeeds → transitions to CLOSED
    const result = await cb.execute(() => Promise.resolve('recovered'))
    expect(result).toBe('recovered')
    expect(cb.getState()).toBe('CLOSED')
  })
})
```

---

## 5. Test Patterns — What to Test

### 5.1 ✅ Test này

```typescript
// Business logic
it('applies 20% discount for VIP users')
it('rejects order when stock is 0')
it('sends email notification on order complete')

// Error cases
it('throws NotFoundException for non-existent product')
it('throws BadRequestException for negative price')

// Edge cases
it('handles zero price')
it('handles very long product names')
it('handles concurrent update correctly')

// Security
it('rejects request without auth token')
it('rejects token with wrong role')
```

### 5.2 ❌ Không cần test

```typescript
// Framework behavior (NestJS đã test)
it('dependency injection works')
it('decorator applies correctly')

// Getters/setters không có logic
it('getName returns name')  // Trivial

// Private methods — test qua public interface
it('_formatPrice formats correctly')  // Test formatPrice() ở nơi nó được dùng

// Third-party libraries
it('mongoose.save() saves to DB')  // Mongoose đã test rồi
```

### 5.3 TDD vs Test-After

**TDD (Test-Driven Development):**
1. Write failing test
2. Write minimal code to pass
3. Refactor

```typescript
// 1. Test trước (sẽ fail vì function chưa exist)
it('calculateShipping returns 0 for orders over 100', () => {
  expect(calculateShipping(150)).toBe(0)
  expect(calculateShipping(100)).toBe(0)
})

it('calculateShipping returns 5 for orders under 100', () => {
  expect(calculateShipping(50)).toBe(5)
  expect(calculateShipping(99.99)).toBe(5)
})

// 2. Implement minimal
function calculateShipping(orderTotal: number): number {
  return orderTotal >= 100 ? 0 : 5
}

// 3. Tests pass → refactor nếu cần
```

**Honest trade-off:** TDD lý tưởng cho pure functions và business logic. Khó áp dụng cho controller, middleware, infrastructure code. Test-after > no test.

---

## 6. Code Coverage

### 6.1 Generate coverage report

```bash
# vitest coverage
npx vitest run --coverage

# Output:
# Coverage report:
# File                | Stmts | Branch | Funcs | Lines
# auth/jwt.service.ts | 95.2  | 88.5   | 100   | 95.2
# products.service.ts | 72.1  | 65.0   | 80.0  | 72.1
```

### 6.2 80% không có nghĩa bug-free

```typescript
// 100% coverage — vẫn có bug!
function divide(a: number, b: number): number {
  return a / b
}

it('divides correctly', () => {
  expect(divide(10, 2)).toBe(5)  // ← test này cover 100% lines
})

// Nhưng chưa test:
divide(10, 0)   // → Infinity (không phải error!)
divide(NaN, 2)  // → NaN
```

**Coverage là điều kiện cần, không đủ.** Focus vào test *behavior*, không test *coverage metric*.

### 6.3 Coverage thực tế của nestjs-boot

```bash
# Run coverage trong nestjs-boot
cd /Users/do.dt/Documents/Github/nestjs-boot
npx vitest run --coverage
```

Xem `tests/auth/jwt.service.spec.ts` — coverage cao vì test đủ cases: valid, invalid, expired, wrong secret.

---

## 7. Hands-on: Write Tests cho Auth Module

### Step 1: Unit test Guard

```typescript
// tests/auth/guards/jwt-auth.guard.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard'
import { Reflector } from '@nestjs/core'
import * as jwt from 'jsonwebtoken'

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard
  let reflector: Reflector
  const secret = 'test-secret'

  beforeEach(() => {
    reflector = new Reflector()
    guard = new JwtAuthGuard(reflector, {
      jwt: { secret, signOptions: { expiresIn: '1h' } },
    })
  })

  const createContext = (token?: string, isPublic = false) => ({
    getHandler: () => ({ key: 'handler' }),
    getClass: () => ({ key: 'class' }),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    }),
  }) as any

  it('passes @Public() routes without token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true)
    const result = await guard.canActivate(createContext())
    expect(result).toBe(true)
  })

  it('throws UnauthorizedException when no Authorization header', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false)
    await expect(guard.canActivate(createContext())).rejects.toThrow(UnauthorizedException)
  })

  it('passes with valid token and sets request.user', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false)
    const token = jwt.sign({ sub: '123', role: 'admin' }, secret, { expiresIn: '1h' })
    const context = createContext(token)

    const result = await guard.canActivate(context)
    expect(result).toBe(true)
    expect(context.switchToHttp().getRequest().user).toMatchObject({ sub: '123' })
  })

  it('throws on expired token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false)
    const expiredToken = jwt.sign({ sub: '123' }, secret, { expiresIn: '-1s' })
    await expect(guard.canActivate(createContext(expiredToken))).rejects.toThrow(UnauthorizedException)
  })
})
```

### Step 2: Chạy test và xem coverage

```bash
cd /Users/do.dt/Documents/Github/nestjs-boot
npx vitest run tests/auth/
npx vitest run tests/auth/ --coverage
```

---

## 8. Bài tập

### Bài tập 1: Negative Tests (Dễ)

Với bất kỳ service nào bạn đã viết ở tuần 3-4, thêm:
- Test với input `null`, `undefined`, empty string
- Test với boundary values (price = 0, price = -1, price = MAX_SAFE_INTEGER)
- Test với invalid ObjectId format cho MongoDB

### Bài tập 2: Đạt 80% coverage (Trung bình)

1. Chọn 1 service module của bạn
2. `npx vitest run --coverage` → xem baseline
3. Viết test cho các uncovered branches
4. Đạt >= 80% trên cả `Stmts`, `Branch`, `Funcs`

### Bài tập 3: Test Concurrent Operations (Nâng cao)

```typescript
it('handles concurrent product creation without duplicate', async () => {
  const dto = { name: 'Limited Edition', price: 999, stock: 1 }

  // 5 concurrent requests cùng lúc
  const results = await Promise.allSettled([
    service.createOrder(dto),
    service.createOrder(dto),
    service.createOrder(dto),
    service.createOrder(dto),
    service.createOrder(dto),
  ])

  const successes = results.filter((r) => r.status === 'fulfilled')
  const failures = results.filter((r) => r.status === 'rejected')

  // Chỉ 1 thành công (stock = 1)
  expect(successes).toHaveLength(1)
  expect(failures).toHaveLength(4)
})
```

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| Test pass local, fail CI | Shared state giữa tests | Dùng `beforeEach` để reset state |
| `vi.fn()` không reset giữa tests | Quên `vi.clearAllMocks()` | Thêm vào `beforeEach` |
| Async test không detect error | Quên `await` trước `expect` | `await expect(fn()).rejects.toThrow()` |
| Test order-dependent | Tests share global state | Mỗi test phải self-contained |
| Coverage cao nhưng bug vẫn có | Test chỉ check happy path | Thêm negative + edge cases |
| `Cannot find module` trong test | Path alias không config cho Vitest | Check `vitest.config.ts` aliases |

---

## Câu hỏi tự kiểm tra

1. Unit test vs Integration test — khi nào dùng cái nào?
2. Tại sao `beforeEach` tạo instance mới thay vì dùng shared instance?
3. `vi.fn()` vs `vi.spyOn()` — khi nào dùng cái nào?
4. 100% code coverage có đảm bảo code không có bug không? Giải thích bằng ví dụ.
5. `MockAuthModule.register()` hoạt động thế nào? Tại sao nó bypass được JwtAuthGuard?

---

## Đọc thêm

- [Vitest documentation](https://vitest.dev/)
- [The Testing Trophy — Kent C. Dodds](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Write tests. Not too many. Mostly integration.](https://kentcdodds.com/blog/write-tests)
- Source: `src/testing/auth/index.ts`, `src/testing/integration/`, `src/testing/http/`
- Test examples: `tests/auth/jwt.service.spec.ts`, `tests/resilience/circuit-breaker.spec.ts`
