# API Test Methods — Tham chiếu toàn diện

> Package: `@nestjs-boot/api-test`

## Mục lục

1. [Giới thiệu](#giới-thiệu)
2. [Mutation Methods](#mutation-methods)
3. [Test Methods](#test-methods)
4. [Bảng tham chiếu nhanh](#bảng-tham-chiếu-nhanh)
5. [Hướng dẫn chọn methods phù hợp](#hướng-dẫn-chọn-methods-phù-hợp)

---

## Giới thiệu

`@nestjs-boot/api-test` cung cấp hơn **20 test methods** để kiểm thử API tự động. Hệ thống chia thành hai nhóm chính:

### Mutations vs Methods

| Khái niệm | Mô tả | Mục đích |
|------------|--------|----------|
| **Mutation** | Biến đổi request gốc (happy case) để tạo test case tự động | Phát hiện lỗi khi input bất thường |
| **Method** | Phương pháp kiểm thử chuyên biệt cho từng khía cạnh API | Kiểm tra chuyên sâu: CRUD, security, performance, v.v. |

**Mutations** nhận một request hợp lệ (recorded response) rồi tự động sinh ra hàng chục biến thể — xóa field, đổi kiểu dữ liệu, chèn payload độc hại — để tìm lỗ hổng. **Methods** thì kiểm tra toàn diện hơn: vòng đời CRUD, contract schema, rate limit, pagination, RBAC, v.v.

---

## Mutation Methods

Có **6 mutation modules**, đăng ký qua `mutationRegistry`:

```typescript
import { mutationRegistry, getMutationModules } from '@nestjs-boot/api-test';

const modules = getMutationModules(['auth', 'body', 'params', 'headers', 'edge', 'method']);
```

### 1. Auth Mutations (`authMutations`)

Kiểm tra xử lý authentication khi credentials bị thay đổi hoặc thiếu.

**Điều kiện kích hoạt:** `config.auth` phải được cấu hình và khác `'none'`.

**Test cases sinh ra:**

| # | Tên | Mô tả | Status kỳ vọng |
|---|-----|-------|-----------------|
| 1 | No auth | Xóa hoàn toàn header auth (Authorization / API key / Cookie) | 401, 403 |
| 2 | Invalid credentials | Thay token bằng giá trị rác (`invalid-garbage-token-xyz`) | 401, 403 |
| 3 | Empty auth value | Đặt giá trị auth thành chuỗi rỗng (`Bearer `) | 401, 403 |
| 4 | Malformed JWT | Chỉ cho `bearer` — token không có dấu chấm (`not-a-jwt-no-dots`) | 401, 403 |

**Hỗ trợ auth types:** `bearer`, `basic`, `api-key`, `cookie`.

```typescript
// Ví dụ config
const config: ApiTestConfig = {
  host: 'http://localhost:3000',
  auth: {
    type: 'bearer',
    token: 'eyJhbGciOi...',
  },
  // ...
};
```

### 2. Body Mutations (`bodyMutations`)

Biến đổi request body để kiểm tra validation.

**Điều kiện kích hoạt:** Endpoint phải có body là object và schema có ít nhất 1 field.

**Test cases per-field (cho mỗi field top-level):**

| # | Tên | Mô tả | Status kỳ vọng |
|---|-----|-------|-----------------|
| 1 | Missing field | Xóa field khỏi body | 400, 422 |
| 2 | Wrong type (string field) | Gửi number thay vì string | 400, 422 |
| 3 | Wrong type (number field) | Gửi string thay vì number | 400, 422 |
| 4 | Null value | Đặt field thành `null` | 400, 422 |

**Test cases toàn body:**

| # | Tên | Mô tả | Status kỳ vọng |
|---|-----|-------|-----------------|
| 5 | Empty body `{}` | Gửi object rỗng | 400, 422 |
| 6 | No body | Xóa body và Content-Type | 400, 422 |
| 7 | Array body | Gửi `[body]` thay vì `body` | 400, 422 |
| 8 | Extra unknown field | Thêm field `__unknown_field_xyz` | 200, 201, 400, 422 |

```typescript
// Ví dụ: endpoint POST /users với body { name: "John", age: 25 }
// Sinh ra: missing 'name', missing 'age', name=12345, age="not-a-number",
//          name=null, age=null, {}, no body, [body], extra field
```

### 3. Params Mutations (`paramsMutations`)

Kiểm tra xử lý path parameters khi giá trị bất hợp lệ.

**Điều kiện kích hoạt:** Endpoint phải có `params` (ví dụ: `:id`, `:slug`).

**Tự động nhận dạng kiểu param:** numeric (`/^\d+$/`), MongoDB ObjectId (`/^[0-9a-f]{24}$/i`), UUID (`/^[0-9a-f]{8}-/`).

**Test cases per-param:**

| # | Tên | Điều kiện | Status kỳ vọng |
|---|-----|-----------|-----------------|
| 1 | Invalid format | numeric/mongoId/uuid | 400, 404, 422 |
| 2 | Non-existent (numeric) | numeric | 404 |
| 3 | Non-existent (mongoId) | mongoId | 404 |
| 4 | Empty string | luôn luôn | 400, 404, 405 |
| 5 | Special chars (XSS) | luôn luôn | 400, 404, 422 |

```typescript
// Endpoint: GET /users/:id với id = "507f1f77bcf86cd799439011"
// → nhận dạng MongoDB ObjectId
// → sinh ra: invalid format, non-existent ObjectId, empty, XSS
```

### 4. Headers Mutations (`headersMutations`)

Kiểm tra xử lý HTTP headers.

**Test cases:**

| # | Tên | Điều kiện | Status kỳ vọng |
|---|-----|-----------|-----------------|
| 1 | No Content-Type | POST/PUT/PATCH có body | 400, 415, 422 |
| 2 | Wrong Content-Type | POST/PUT/PATCH có body — đổi sang `text/plain` | 400, 415, 422 |
| 3 | No Accept header | luôn luôn — xóa Accept | 200, 201, 204 |

Case thứ 3 kiểm tra rằng API vẫn hoạt động bình thường khi thiếu Accept header.

### 5. Edge Mutations (`edgeMutations`)

Kiểm tra giá trị biên (edge case) cho từng field.

**Cho string fields:**

| Mutation | Giá trị | Status kỳ vọng |
|----------|---------|-----------------|
| Empty string | `""` | 400, 422, 200, 201 |
| Very long string | `"x" × 10,000` | 400, 413, 422 |
| XSS payload | `<script>alert(1)</script>` | 200, 201, 400, 422 |
| SQL injection | `' OR 1=1 --` | 200, 201, 400, 422 |
| Unicode null | `\u0000` | 200, 201, 400, 422 |

XSS test còn kiểm tra `bodyNotContains` — đảm bảo response không chứa script tag nguyên bản.
SQL injection test kiểm tra response không chứa `syntax error`, `SQL`, `mysql`, `postgresql`.

**Cho number fields:**

| Mutation | Giá trị |
|----------|---------|
| zero | `0` |
| negative | `-1` |
| MAX_SAFE_INTEGER | `9007199254740991` |
| float | `1.5` |

### 6. Method Mutations (`methodMutations`)

Gửi HTTP method sai để kiểm tra endpoint từ chối đúng cách.

Với mỗi endpoint, sinh test case cho **tất cả methods khác** trong danh sách `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.

**Status kỳ vọng:** 405, 404, 400, 301.

```typescript
// Endpoint: POST /users
// Sinh ra:
//   GET /users — wrong method (expected POST)    → 405/404/400/301
//   PUT /users — wrong method (expected POST)    → 405/404/400/301
//   PATCH /users — wrong method (expected POST)  → 405/404/400/301
//   DELETE /users — wrong method (expected POST) → 405/404/400/301
```

---

## Test Methods

### 1. CRUD Lifecycle (`generateCrudLifecycle`)

Kiểm tra toàn bộ vòng đời CRUD: Create → Read → Update → Partial Update → Delete → Verify Deleted → Idempotent Delete.

```typescript
import { generateCrudLifecycle } from '@nestjs-boot/api-test';

const cases = generateCrudLifecycle(config, {
  basePath: '/users',
  createPayload: { name: 'Test User', email: 'test@example.com' },
  updatePayload: { name: 'Updated User' },
  idField: 'id', // mặc định 'id'
});
```

**7 bước tuần tự (mỗi bước phụ thuộc bước trước):**

| Bước | Method | Mô tả | Status kỳ vọng |
|------|--------|-------|-----------------|
| 1 | POST | Tạo resource mới | 200, 201 |
| 2 | GET /:id | Đọc resource vừa tạo | 200 |
| 3 | PUT /:id | Cập nhật toàn bộ | 200 |
| 4 | PATCH /:id | Cập nhật một phần | 200 |
| 5 | DELETE /:id | Xóa resource | 200, 204 |
| 6 | GET /:id | Xác nhận đã xóa | 404 |
| 7 | DELETE /:id | Xóa lần 2 (idempotent) | 404, 410 |

Hệ thống tự trích xuất ID từ bước 1 (`extractId`) và inject vào các bước sau (`injectId`).

### 2. Contract Testing (`generateContractTests`)

Xác minh response body tuân theo schema — kiểm tra kiểu dữ liệu, required fields, và strict mode (không có field thừa).

```typescript
import { generateContractTests, inferSchema } from '@nestjs-boot/api-test';

// Tự động suy luận schema từ happy case response
const cases = generateContractTests(endpoint, happyCase, config);

// Hoặc cung cấp OpenAPI schema
const cases2 = generateContractTests(endpoint, happyCase, config, openApiSchema);
```

**Test cases sinh ra:**

| # | Tên | Mô tả |
|---|-----|-------|
| 1 | Schema match | Toàn bộ response khớp schema (types + required fields) |
| 2 | Field presence | Mỗi required field phải có mặt trong response |
| 3 | Type checks | Mỗi field phải đúng kiểu (`string`, `number`, `object`, `array`) |
| 4 | No extra fields | Response không chứa field ngoài schema (khi `additionalProperties: false`) |

Hàm `inferSchema()` tự suy luận schema từ response body — hỗ trợ object lồng nhau, array, nullable fields.

### 3. Smoke Testing (`generateSmokeTests`)

Kiểm tra nhanh: replay tất cả recorded requests, đảm bảo không endpoint nào trả 5xx.

```typescript
import { generateSmokeTests } from '@nestjs-boot/api-test';

const cases = generateSmokeTests(recordings, config);
```

Lọc bỏ recording có status 0 hoặc >= 500. Mỗi test case replay đúng request gốc, kỳ vọng status < 500.

### 4. Regression Testing (`generateRegressionTests`)

So sánh response hiện tại với baseline đã lưu — phát hiện thay đổi bất ngờ.

```typescript
import { generateRegressionTests, diffBaseline } from '@nestjs-boot/api-test';

const cases = generateRegressionTests(recordings, config, outputDir);
```

**Cơ chế hoạt động:**
1. Lưu baseline lần đầu: status, cấu trúc body (đệ quy), key fields (scalar top-level)
2. Replay request → so sánh với baseline
3. `diffBaseline()` phát hiện: status thay đổi, field thiếu, kiểu đổi, field mới, giá trị key field drift

Baseline files lưu tại `{outputDir}/baselines/{slug}.baseline.json`.

### 5. Status Codes (`generateStatusCodeTests`)

Kiểm tra API trả đúng status code cho mỗi tình huống.

```typescript
import { generateStatusCodeTests } from '@nestjs-boot/api-test';

const cases = generateStatusCodeTests(endpoint, happyCase, config);
```

**Test cases:**

| Status | Cách kích hoạt | Điều kiện |
|--------|----------------|-----------|
| 200/201 | Replay happy case | luôn luôn |
| 400 | Body malformed (`not-valid-json{{{`) | POST/PUT/PATCH |
| 401 | Xóa auth header | có auth config |
| 403 | Token sai role | có auth config |
| 404 | Resource ID không tồn tại | luôn luôn |
| 405 | HTTP method sai | luôn luôn |
| 409 | Duplicate POST (cùng payload) | POST có body |
| 422 | Body rỗng `{}` | POST/PUT/PATCH |
| 429 | Rate limit (thông tin) | luôn luôn |

### 6. Security Testing (`generateSecurityTests`)

Kiểm tra bảo mật toàn diện: injection, traversal, header injection.

```typescript
import { generateSecurityTests, DEFAULT_SECURITY_PAYLOADS } from '@nestjs-boot/api-test';

const cases = generateSecurityTests(endpoint, happyCase, schema, config);

// Hoặc custom payloads
const cases2 = generateSecurityTests(endpoint, happyCase, schema, config, customPayloads);
```

**6 loại tấn công:**

| Loại | Số payloads | Ví dụ |
|------|-------------|-------|
| SQL Injection | 6 | `' OR 1=1--`, `1; DROP TABLE users` |
| NoSQL Injection | 5 | `{"$gt":""}`, `{"$where":"1==1"}` |
| Command Injection | 6 | `; ls`, `` `whoami` ``, `$(id)` |
| SSTI | 5 | `{{7*7}}`, `${7*7}` |
| Path Traversal | 5 | `../../etc/passwd`, `..%2f..%2fetc%2fpasswd` |
| Header Injection | 3 | `\r\nX-Injected: true` |

**Vị trí test:** body fields (string), query params, path params, headers.

**Kiểm tra response:** không chứa stack trace (`at Object.`, `node_modules/`, v.v.) và không chứa dữ liệu nhạy cảm (`root:x:0:0`, `BEGIN RSA`, v.v.).

### 7. Performance Testing (`generatePerformanceTests`)

Đo thời gian phản hồi theo phân vị p50, p95, p99.

```typescript
import { generatePerformanceTests, measureEndpoint, DEFAULT_PERFORMANCE_CONFIG } from '@nestjs-boot/api-test';

// Sinh test cases
const cases = generatePerformanceTests(endpoint, happyCase, config, {
  thresholds: { p50: 200, p95: 500, p99: 1000 },
  iterations: 10,
});

// Đo trực tiếp
const stats = await measureEndpoint(endpoint, config, 10);
console.log(`p50: ${stats.p50}ms, p95: ${stats.p95}ms, p99: ${stats.p99}ms`);
```

**Ngưỡng mặc định:** p50 ≤ 200ms, p95 ≤ 500ms, p99 ≤ 1000ms.

`measureEndpoint()` chạy N lần, tính min/max/mean/percentiles từ danh sách durations đã sort.

### 8. Spec Drift (`generateSpecDriftTests`)

So sánh API thực tế với OpenAPI/Swagger spec — phát hiện drift (lệch spec).

```typescript
import { generateSpecDriftTests } from '@nestjs-boot/api-test';

const cases = generateSpecDriftTests(config, {
  specPath: './openapi.json', // hoặc .yaml (cần js-yaml)
});
```

**Test cases per-endpoint trong spec:**

| # | Kiểm tra |
|---|----------|
| 1 | Status code trả về nằm trong danh sách spec định nghĩa |
| 2 | Response body schema khớp spec (fields + types) |
| 3 | Required parameters được spec ghi nhận |

Hỗ trợ `$ref` resolution, `allOf` merge, nested properties.

### 9. Boundary Testing (`generateBoundaryTests`)

Kiểm tra giá trị biên chuyên sâu — tự nhận dạng pattern (`email`, `uuid`, `iso-date`) và type.

```typescript
import { generateBoundaryTests } from '@nestjs-boot/api-test';

const cases = generateBoundaryTests(endpoint, happyCase, schema, config);
```

**Boundaries theo kiểu:**

| Kiểu/Pattern | Số test values | Ví dụ |
|---------------|----------------|-------|
| `string` | 7 | empty, 1 char, 10000 chars, whitespace only, unicode surrogate, null bytes |
| `email` | 7 | valid, missing @, double @, very long local, unicode domain, no domain, no local |
| `uuid` | 5 | valid, short, non-hex chars, empty, no dashes |
| `iso-date` | 8 | valid ISO, invalid format, epoch 0, far future, far past, invalid month/day |
| `number` (int) | 7 | 0, -1, 1, MAX_SAFE_INTEGER, MIN_SAFE_INTEGER, overflow, decimal |
| `number` (float) | 7 | 0.0, -0.1, very small (1e-300), very large (1e+300), NaN, Infinity, -Infinity |
| `boolean` | 6 | true, false, "true", 1, 0, null |
| `array` | 5 | empty, 1 item, 100 items, deeply nested, null in array |

Cũng kiểm tra query params: empty, very long (8000), whitespace only.

### 10. Negative Testing (`generateNegativeTests`)

Kiểm tra hành vi API khi nhận input hoàn toàn sai — bổ sung cho body mutations.

```typescript
import { generateNegativeTests } from '@nestjs-boot/api-test';

const cases = generateNegativeTests(endpoint, happyCase, config);
```

**Test cases (cho POST/PUT/PATCH):**

| # | Mutation | Status kỳ vọng |
|---|----------|-----------------|
| 1 | Empty body + Content-Type: application/json | 400, 422 |
| 2 | Body = `"not json"` (invalid JSON) | 400, 422 |
| 3 | Body = `null` | 400, 422 |
| 4 | Body = `[]` (array khi cần object) | 400, 422 |
| 5 | Body = object lồng 100 cấp | 400, 413, 422 |
| 6 | Content-Type: text/plain + JSON body | 400, 415, 422 |
| 7 | Không có Content-Type header | 400, 415, 422 |

**Test cases chung:**

| # | Mutation | Status kỳ vọng |
|---|----------|-----------------|
| 8 | Duplicate query param (`?id=1&id=2`) | 200, 400, 422 |
| 9 | URL rất dài (8000+ ký tự) | 400, 414, 431 |
| 10 | Header value 16KB | 400, 431 |

### 11. Flow Testing (`generateFlow`)

Kiểm tra chuỗi request phụ thuộc nhau — multi-step workflow.

```typescript
import { generateFlow } from '@nestjs-boot/api-test';

const cases = generateFlow(config, {
  name: 'User Registration Flow',
  steps: [
    {
      name: 'Register user',
      method: 'POST',
      path: '/auth/register',
      body: { email: 'test@example.com', password: 'Secret123' },
      extract: { userId: '$.id', token: '$.token' },
      expect: { status: 201 },
    },
    {
      name: 'Get profile',
      method: 'GET',
      path: '/users/{{userId}}',
      headers: { Authorization: 'Bearer {{token}}' },
      expect: { status: 200 },
    },
    {
      name: 'Update profile',
      method: 'PATCH',
      path: '/users/{{userId}}',
      body: { name: 'Updated Name' },
      expect: { status: 200 },
    },
  ],
});
```

**Tính năng:**
- `extract` — trích biến từ response (JSONPath)
- `{{varName}}` — thay thế biến trong path, body, headers (deep substitute)
- `dependsOn` — test case sau phụ thuộc test case trước
- Hỗ trợ chuỗi không giới hạn số bước

### 12. Parameterized Testing (`generateParameterized`)

Test data-driven — chạy cùng endpoint với nhiều bộ dữ liệu khác nhau.

```typescript
import { generateParameterized } from '@nestjs-boot/api-test';

// Inline data
const cases = generateParameterized(config, {
  endpoint: { method: 'POST', path: '/products' },
  dataSource: 'inline',
  data: [
    { name: 'Widget', price: 9.99, _expect: { status: 201 } },
    { name: '', price: 9.99, _expect: { status: 422 } },
    { name: 'Widget', price: -1, _expect: { status: 422 } },
  ],
  expectPerRow: { status: 200 },
});

// Từ file CSV
const cases2 = generateParameterized(config, {
  endpoint: { method: 'POST', path: '/products', body: { name: '{{name}}', price: '{{price}}' } },
  dataSource: 'csv',
  data: [],
  filePath: './test-data/products.csv',
});
```

**Data sources:** `inline`, `csv` (auto-parse header row), `json` (file).

Hỗ trợ `{{placeholder}}` substitution trong URL và body. Mỗi row có thể override status kỳ vọng qua `_expect`.

### 13. Rate Limit Testing (`generateRateLimitTests`)

Kiểm tra cơ chế rate limiting — tự phát hiện limit từ response headers.

```typescript
import { generateRateLimitTests, detectRateLimit } from '@nestjs-boot/api-test';

const cases = generateRateLimitTests(config, {
  endpoint: { method: 'GET', path: '/api/search' },
  burstCount: 50, // mặc định nếu không detect được
  detectFromHeaders: true, // mặc định true
}, happyCase);
```

**Test cases:**

| # | Mô tả | Status kỳ vọng |
|---|-------|-----------------|
| 1 | Burst N requests liên tục — request cuối phải bị 429 | 429 |
| 2 | Kiểm tra `Retry-After` header có mặt khi 429 | 429 + header |
| 3 | Headers rate limit giảm dần (nếu detect được limit) | 200 hoặc 429 |

**Auto-detect headers:** `x-ratelimit-limit`, `ratelimit-limit`, `x-rate-limit-limit`, `x-ratelimit-remaining`, `retry-after`.

Nếu phát hiện limit từ headers, burst count = limit + 1.

### 14. Pagination Testing (`generatePaginationTests`)

Kiểm tra pagination — tự phát hiện kiểu (offset/cursor).

```typescript
import { generatePaginationTests, detectPagination } from '@nestjs-boot/api-test';

const cases = generatePaginationTests(config, endpoint, happyCase);
```

**Auto-detect:**
- **Page params:** `page`, `p`, `pageNumber`, `page_number`
- **Limit params:** `limit`, `size`, `per_page`, `perPage`, `pageSize`, `count`
- **Cursor params:** `cursor`, `after`, `before`, `next_cursor`, `continuation`
- **Data field:** `data`, `items`, `results`, `records`, `rows`
- **Total field:** `total`, `totalCount`, `total_items`, `count`

**Test cases:**

| # | Mô tả | Status kỳ vọng |
|---|-------|-----------------|
| 1 | Page 1 vs Page 2 — không trùng item | 200 |
| 2 | Trang cuối — items <= limit | 200, 404 |
| 3 | Vượt quá trang cuối — empty hoặc 404 | 200, 404 |
| 4 | `limit=0` | 200, 400 |
| 5 | `limit=-1` (invalid) | 400, 422 |
| 6 | `limit=10000` (rất lớn) | 200, 400 |
| 7 | Cursor follow (nếu cursor-based) | 200 |
| 8 | Total count nhất quán (nếu có total field) | 200 |

### 15. Auth Matrix (`generateAuthMatrix`)

Kiểm tra RBAC (Role-Based Access Control) — ma trận endpoint x role.

```typescript
import { generateAuthMatrix } from '@nestjs-boot/api-test';

const cases = generateAuthMatrix(config, {
  roles: [
    { name: 'admin', token: 'admin-jwt-token' },
    { name: 'user', token: 'user-jwt-token' },
    { name: 'guest', token: 'guest-jwt-token', tokenType: 'api-key', headerName: 'X-API-Key' },
  ],
  matrix: [
    { endpoint: 'GET /users', allowedRoles: ['admin', 'user'] },
    { endpoint: 'POST /users', allowedRoles: ['admin'] },
    { endpoint: 'DELETE /users/:id', allowedRoles: ['admin'] },
  ],
});
```

**Mỗi endpoint sinh ra:**
- 1 test **no auth** → kỳ vọng 401
- N tests (mỗi role) → allowed role: kỳ vọng 200/201/204, denied role: kỳ vọng 403

Hỗ trợ `bearer` (mặc định) và `api-key` token types.

### 16. CORS Testing (`generateCorsTests`)

Kiểm tra CORS policy — preflight, allowed/disallowed origins, wildcard, security headers.

```typescript
import { generateCorsTests } from '@nestjs-boot/api-test';

const cases = generateCorsTests(config, {
  endpoint: { method: 'POST', path: '/api/data' },
  allowedOrigins: ['https://myapp.com', 'https://staging.myapp.com'],
  disallowedOrigins: ['https://evil.example.com', 'http://attacker.test'],
});
```

**Test cases:**

| # | Mô tả |
|---|-------|
| 1 | Same origin preflight — kỳ vọng `access-control-allow-origin` header |
| 2 | Allowed origins — CORS headers có mặt |
| 3 | Disallowed origins — CORS headers không được reflect |
| 4 | Wildcard check — phát hiện `Access-Control-Allow-Origin: *` |
| 5 | Credentials + wildcard — không hợp lệ theo spec |
| 6 | Security headers — `x-content-type-options`, `x-frame-options`, HSTS |

### 17. Pairwise Testing (`generatePairwiseTests`)

Kiểm tra tổ hợp tham số tối ưu — thuật toán all-pairs covering array.

```typescript
import { generatePairwiseTests, generateCoveringArray } from '@nestjs-boot/api-test';

const cases = generatePairwiseTests({
  endpoint: { method: 'POST', path: '/search' },
  parameters: [
    { field: 'category', values: ['electronics', 'books', 'clothing'], location: 'body' },
    { field: 'sort', values: ['price', 'rating', 'newest'], location: 'query' },
    { field: 'currency', values: ['USD', 'EUR', 'VND'], location: 'header' },
  ],
}, config);
```

**Cách hoạt động:**
- Thay vì test tất cả `3 × 3 × 3 = 27` tổ hợp, pairwise đảm bảo mọi cặp 2 tham số đều xuất hiện ít nhất 1 lần
- Thuật toán greedy: chọn row phủ nhiều cặp chưa covered nhất
- Kết quả thường giảm ~60-80% số test case so với exhaustive

**Location types:** `body`, `query`, `header`, `param`.

### 18. Fuzzing (`generateFuzzTests`)

Kiểm tra với dữ liệu ngẫu nhiên có kiểm soát — seedable PRNG (xorshift32).

```typescript
import { generateFuzzTests, scoreFuzzResults } from '@nestjs-boot/api-test';

const cases = generateFuzzTests({
  endpoint: { method: 'POST', path: '/api/process' },
  fields: [
    { name: 'input', type: 'string', location: 'body' },
    { name: 'count', type: 'number', location: 'body' },
  ],
  iterations: 100, // mặc định 100
  seed: 42,         // mặc định 42 — reproducible
}, config);

// Sau khi chạy, phân loại severity
const scored = scoreFuzzResults(results);
```

**Giá trị fuzz theo kiểu:**

| Kiểu | Ví dụ |
|------|-------|
| `string` | Empty, null bytes, format strings (`%s%x%n`), template injection, XSS, SQLi, path traversal, 10K chars, lone surrogate, prototype pollution JSON |
| `number` | 0, -0, MAX_SAFE_INTEGER, MAX_VALUE, Infinity, NaN, 1e308 |
| `boolean` | true, false, 0, 1, "true", "false", null, "" |
| `object` | Nested 1-5 cấp, prototype pollution, constructor override |
| `array` | 0-100 items, mixed types |

**Severity scoring:**

| Severity | Điều kiện |
|----------|-----------|
| HIGH | Status >= 500 (server crash) |
| MEDIUM | Status >= 400 + stack trace trong response |
| LOW | Status >= 400 (lỗi xử lý đúng) |
| NONE | Status < 400 (bình thường) |

### 19. State Machine Testing (`generateStateMachineTests`)

Kiểm tra state transitions hợp lệ và không hợp lệ.

```typescript
import { generateStateMachineTests } from '@nestjs-boot/api-test';

const cases = generateStateMachineTests({
  resource: 'Order',
  basePath: '/orders',
  stateField: 'status',
  states: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
  initialState: 'pending',
  createPayload: { product: 'Widget', quantity: 1 },
  transitions: [
    { from: 'pending', to: 'confirmed', method: 'PATCH' },
    { from: 'confirmed', to: 'shipped', method: 'PATCH' },
    { from: 'shipped', to: 'delivered', method: 'PATCH' },
    { from: 'pending', to: 'cancelled', method: 'PATCH' },
  ],
}, config);
```

**Test cases sinh ra:**

| Loại | Mô tả | Status kỳ vọng |
|------|-------|-----------------|
| Create | Tạo resource (initial state) | 200, 201 |
| Valid transitions | Mỗi transition trong danh sách | 200, 204 |
| Invalid transitions | Mọi cặp (from, to) KHÔNG trong danh sách | 400, 422, 409 |
| Self-transitions | Mỗi state → chính nó (idempotency test) | 200, 400, 422 |
| Terminal state | State không có outgoing transitions → mọi target đều fail | 400, 422, 409 |

Hỗ trợ `dependsOn` để chạy tuần tự, `extractVariables` để truyền ID giữa các bước.

### 20. Load Testing (`generateLoadTests`)

Sinh script k6 và cấu hình autocannon cho load testing.

```typescript
import { generateLoadTests } from '@nestjs-boot/api-test';

const { files, dir } = generateLoadTests(recordings, config, {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  p95Threshold: 500, // ms
  maxFailRate: 0.05, // 5%
  connections: 10,   // autocannon
  duration: 30,      // autocannon seconds
});
```

**Output:**
- `{outputDir}/load/k6/{slug}.js` — k6 script per endpoint
- `{outputDir}/load/autocannon/config.json` — combined autocannon config
- `{outputDir}/load/README.md` — hướng dẫn chạy

**k6 script mẫu sinh ra:**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};
```

---

## Bảng tham chiếu nhanh

### Mutation Methods

| Module | Điều kiện | Số cases (trung bình) | Tìm lỗi gì |
|--------|-----------|----------------------|-------------|
| `auth` | auth configured | 3-4 | Auth bypass, token validation |
| `body` | có body + schema | 4N + 4 (N = fields) | Validation thiếu, type coercion |
| `params` | có path params | 2-5 per param | Param injection, format validation |
| `headers` | luôn luôn | 2-3 | Content-Type handling |
| `edge` | có body + schema | 5-9 per field | XSS, SQLi, boundary values |
| `method` | luôn luôn | 4 | Method routing sai |

### Test Methods

| Method | Import | Cần happy case | Cần schema | Use case |
|--------|--------|---------------|------------|----------|
| `generateCrudLifecycle` | crud-lifecycle | no | no | Vòng đời CRUD |
| `generateContractTests` | contract | yes | optional | Schema compliance |
| `generateSmokeTests` | smoke | yes (nhiều) | no | Health check nhanh |
| `generateRegressionTests` | regression | yes (nhiều) | no | Phát hiện drift |
| `generateStatusCodeTests` | status-codes | yes | no | Status code coverage |
| `generateSecurityTests` | security | yes | yes | Injection attacks |
| `generatePerformanceTests` | performance | yes | no | Latency thresholds |
| `generateSpecDriftTests` | spec-drift | no | no (cần spec file) | OpenAPI compliance |
| `generateBoundaryTests` | boundary | yes | yes | Giá trị biên |
| `generateNegativeTests` | negative | yes | no | Malformed input |
| `generateFlow` | flow | no | no | Multi-step workflows |
| `generateParameterized` | parameterized | no | no | Data-driven testing |
| `generateRateLimitTests` | rate-limit | optional | no | Rate limit verification |
| `generatePaginationTests` | pagination | optional | no | Pagination correctness |
| `generateAuthMatrix` | auth-matrix | no | no | RBAC coverage |
| `generateCorsTests` | cors | no | no | CORS policy |
| `generatePairwiseTests` | pairwise | no | no | Tổ hợp tham số |
| `generateFuzzTests` | fuzzing | no | no | Random input testing |
| `generateStateMachineTests` | state-machine | no | no | State transitions |
| `generateLoadTests` | load-test | yes (nhiều) | no | k6/autocannon scripts |

---

## Hướng dẫn chọn methods phù hợp

### Theo giai đoạn phát triển

| Giai đoạn | Methods khuyến nghị |
|-----------|-------------------|
| **Prototype / MVP** | Smoke + Status Codes + Body Mutations |
| **Pre-release** | + Contract + Security + Auth + Boundary + Negative |
| **Production** | + Regression + Performance + Rate Limit + Load Test |
| **Mature API** | + Spec Drift + CRUD Lifecycle + Auth Matrix + CORS + Pairwise + Fuzzing + State Machine |

### Theo mục tiêu kiểm thử

| Mục tiêu | Methods |
|----------|---------|
| **API có hoạt động không?** | Smoke |
| **Validation đúng chưa?** | Body Mutations + Boundary + Negative + Edge Mutations |
| **Bảo mật?** | Security + Auth Mutations + Auth Matrix + CORS |
| **Performance?** | Performance + Load Test + Rate Limit |
| **Schema ổn định?** | Contract + Regression + Spec Drift |
| **Business logic?** | CRUD Lifecycle + Flow + State Machine |
| **Coverage tối đa?** | Pairwise + Parameterized + Fuzzing |

### Theo loại endpoint

| Loại endpoint | Methods ưu tiên |
|---------------|----------------|
| **GET /resources** | Smoke, Pagination, Status Codes, Performance |
| **GET /resources/:id** | Params Mutations, Status Codes (404), Contract |
| **POST /resources** | Body Mutations, Edge, Boundary, Negative, Security |
| **PUT/PATCH /resources/:id** | Body + Params Mutations, CRUD Lifecycle |
| **DELETE /resources/:id** | Params Mutations, CRUD (idempotent delete), Method |
| **Auth endpoints** | Auth Mutations, Auth Matrix, Flow (login chain) |
| **Search / filter** | Parameterized, Pairwise, Pagination, Performance |
| **Stateful resources** | State Machine, Flow |

### Công thức nhanh

```typescript
// Bộ test tối thiểu cho mọi endpoint
const minimalSuite = [
  ...generateSmokeTests(recordings, config),
  ...generateStatusCodeTests(endpoint, happyCase, config),
];

// Bộ test đầy đủ cho endpoint có body
const fullBodySuite = [
  // Mutations
  ...authMutations.generate(endpoint, happyCase, schema, config),
  ...bodyMutations.generate(endpoint, happyCase, schema, config),
  ...edgeMutations.generate(endpoint, happyCase, schema, config),
  ...headersMutations.generate(endpoint, happyCase, schema, config),
  ...methodMutations.generate(endpoint, happyCase, schema, config),
  // Methods
  ...generateContractTests(endpoint, happyCase, config),
  ...generateBoundaryTests(endpoint, happyCase, schema, config),
  ...generateNegativeTests(endpoint, happyCase, config),
  ...generateSecurityTests(endpoint, happyCase, schema, config),
  ...generatePerformanceTests(endpoint, happyCase, config),
];
```
