# API Test Methods Reference

This guide documents every test method available in `@nestjs-boot/api-test`. The package provides **26 test generators** organized into two categories:

- **Mutation Methods (6)** -- Systematically mutate parts of a valid request (auth, body, params, headers, edge cases, HTTP method) to verify the API rejects invalid input.
- **Test Methods (20)** -- Testing strategies ranging from smoke tests and contract validation to fuzzing, state machine verification, and load test scaffolding.

All methods are auto-generated from recorded happy-case responses and endpoint configuration. You can enable or disable each method via the interactive wizard or directly in your `api-test.config.ts`.

---

## Table of Contents

- [Mutation Methods](#mutation-methods)
  - [1. Auth Mutations](#1-auth-mutations)
  - [2. Body Mutations](#2-body-mutations)
  - [3. Params Mutations](#3-params-mutations)
  - [4. Headers Mutations](#4-headers-mutations)
  - [5. Edge Case Mutations](#5-edge-case-mutations)
  - [6. HTTP Method Mutations](#6-http-method-mutations)
- [Test Methods](#test-methods)
  - [7. CRUD Lifecycle](#7-crud-lifecycle)
  - [8. Contract / Schema Validation](#8-contract--schema-validation)
  - [9. Smoke Testing](#9-smoke-testing)
  - [10. Regression / Baseline](#10-regression--baseline)
  - [11. Status Code Coverage](#11-status-code-coverage)
  - [12. Security (Deep Injection)](#12-security-deep-injection)
  - [13. Performance / Latency](#13-performance--latency)
  - [14. Spec Drift Detection](#14-spec-drift-detection)
  - [15. Boundary Testing](#15-boundary-testing)
  - [16. Negative / Malformed Testing](#16-negative--malformed-testing)
  - [17. Multi-Step Flow](#17-multi-step-flow)
  - [18. Parameterized / Data-Driven](#18-parameterized--data-driven)
  - [19. Rate Limiting](#19-rate-limiting)
  - [20. Pagination](#20-pagination)
  - [21. Auth / Role Matrix (RBAC)](#21-auth--role-matrix-rbac)
  - [22. CORS / Security Headers](#22-cors--security-headers)
  - [23. Pairwise / Combinatorial](#23-pairwise--combinatorial)
  - [24. Fuzzing](#24-fuzzing)
  - [25. State Machine](#25-state-machine)
  - [26. Load Test Scaffold](#26-load-test-scaffold)
- [Quick Reference Table](#quick-reference-table)
- [Choosing the Right Methods](#choosing-the-right-methods)

---

## Mutation Methods

Mutation methods take a recorded happy-case request and systematically alter one aspect of it to verify the API properly validates and rejects bad input. Each mutation module implements the `MutationModule` interface with a `generate()` function.

### 1. Auth Mutations

**What it tests:** Verifies that your API properly enforces authentication by removing, invalidating, or emptying authentication credentials. Supports Bearer tokens, API keys, Basic auth, and cookie-based authentication.

**Generated test cases:**

| Case | Mutation | Expected Status |
|------|----------|-----------------|
| No auth | Remove the `Authorization` header (or API key header, or `Cookie`) entirely | 401 or 403 |
| Invalid credentials | Replace token/key with garbage value (`invalid-garbage-token-xyz`) | 401 or 403 |
| Empty auth value | Set the auth header to an empty value (`Bearer `) | 401 or 403 |
| Malformed JWT | (Bearer only) Replace token with a non-JWT string containing no dots | 401 or 403 |

**Example test case:**

```json
{
  "id": "auth-001",
  "name": "POST /users — no auth",
  "category": "auth",
  "description": "Request without authentication credentials",
  "request": {
    "method": "POST",
    "url": "http://localhost:3000/api/users",
    "headers": { "Content-Type": "application/json" },
    "body": { "name": "Alice", "email": "alice@example.com" }
  },
  "expect": { "status": [401, 403] },
  "mutation": "Removed authentication header/cookie"
}
```

**Config options:** Requires `config.auth` to be set. Skipped entirely when `auth.type === 'none'`. Supported types: `bearer`, `api-key` (with `headerName`), `basic`, `cookie` (with `cookieName`).

**Cases per endpoint:** 3 (all auth types) or 4 (Bearer adds malformed JWT).

---

### 2. Body Mutations

**What it tests:** Validates request body handling by removing required fields, sending wrong types, null values, empty objects, missing bodies, array-wrapped bodies, and extra unknown fields. Operates on top-level fields from the inferred payload schema.

**Generated test cases:**

| Case | Mutation | Expected Status |
|------|----------|-----------------|
| Missing field | Remove each top-level field one at a time | 400 or 422 |
| Wrong type (string field) | Send number instead of string | 400 or 422 |
| Wrong type (number field) | Send string instead of number | 400 or 422 |
| Null value | Set each field to `null` | 400 or 422 |
| Empty body `{}` | Replace entire body with empty object | 400 or 422 |
| No body | Remove body and Content-Type header entirely | 400 or 422 |
| Array body | Wrap body in array `[body]` | 400 or 422 |
| Extra unknown field | Add `__unknown_field_xyz` to body | 200, 201, 400, or 422 |

**Example test case:**

```json
{
  "name": "POST /users — missing 'email'",
  "category": "body",
  "request": {
    "method": "POST",
    "url": "http://localhost:3000/api/users",
    "body": { "name": "Alice" }
  },
  "expect": { "status": [400, 422] },
  "mutation": "Removed field 'email'"
}
```

**Config options:** Requires endpoint to have a body and a non-empty payload schema. Only top-level fields are mutated.

**Cases per endpoint:** `(N * 2..3) + 4` where N = number of top-level fields. Each field gets: remove + null + type-mismatch (if string or number). Plus 4 whole-body mutations (empty, no body, array, extra field).

---

### 3. Params Mutations

**What it tests:** Validates URL path parameter handling by sending invalid formats, non-existent IDs, empty strings, and XSS payloads for each `:param` in the URL path. Auto-detects parameter format (numeric, MongoDB ObjectId, UUID) to generate targeted mutations.

**Generated test cases:**

| Case | Condition | Expected Status |
|------|-----------|-----------------|
| Invalid format | Numeric/MongoId/UUID param detected | 400, 404, or 422 |
| Non-existent resource (numeric) | Numeric param | 404 |
| Non-existent resource (MongoId) | MongoId param | 404 |
| Empty string | Always | 400, 404, or 405 |
| Special characters (XSS) | Always | 400, 404, or 422 |

**Example test case:**

```json
{
  "name": "GET /users/:id — :id invalid format",
  "category": "params",
  "request": {
    "method": "GET",
    "url": "http://localhost:3000/api/users/abc-not-valid"
  },
  "expect": { "status": [400, 404, 422] },
  "mutation": "Changed :id from '507f1f77bcf86cd799439011' to 'abc-not-valid'"
}
```

**Cases per endpoint:** 2-4 per path parameter, depending on detected format.

---

### 4. Headers Mutations

**What it tests:** Validates HTTP header handling by removing or changing Content-Type for endpoints with bodies, and removing the Accept header on all endpoints. Verifies the API handles missing or incorrect content negotiation gracefully.

**Generated test cases:**

| Case | Condition | Expected Status |
|------|-----------|-----------------|
| No Content-Type | POST/PUT/PATCH with body | 400, 415, or 422 |
| Wrong Content-Type (`text/plain`) | POST/PUT/PATCH with body | 400, 415, or 422 |
| No Accept header | All endpoints | 200, 201, or 204 (should still work) |

**Example test case:**

```json
{
  "name": "POST /users — wrong Content-Type",
  "category": "headers",
  "request": {
    "method": "POST",
    "url": "http://localhost:3000/api/users",
    "headers": { "Content-Type": "text/plain" },
    "body": { "name": "Alice" }
  },
  "expect": { "status": [400, 415, 422] }
}
```

**Cases per endpoint:** 1 (GET/DELETE) or 3 (POST/PUT/PATCH with body).

---

### 5. Edge Case Mutations

**What it tests:** Sends boundary and adversarial values for each field in the request body. For string fields: empty string, 10,000-character string, XSS payload, SQL injection, and Unicode null character. For number fields: zero, negative, MAX_SAFE_INTEGER, and float values. Checks both that the API handles these gracefully and that responses do not echo back dangerous payloads.

**Generated test cases:**

| Case | Field Type | Mutation | Expected Status |
|------|-----------|----------|-----------------|
| Empty string | string | `""` | 200/201 or 400/422 |
| Very long string | string | 10,000 chars | 400, 413, or 422 |
| XSS payload | string | `<script>alert(1)</script>` | 200/201 or 400/422 (body must NOT contain the script tag) |
| SQL injection | string | `' OR 1=1 --` | 200/201 or 400/422 (body must NOT contain SQL error keywords) |
| Unicode null | string | `\u0000` | 200/201 or 400/422 |
| Zero | number | `0` | 200/201 or 400/422 |
| Negative | number | `-1` | 200/201 or 400/422 |
| MAX_SAFE_INTEGER | number | `9007199254740991` | 200/201 or 400/422 |
| Float | number | `1.5` | 200/201 or 400/422 |

**Example test case:**

```json
{
  "name": "POST /users — 'name' XSS payload",
  "category": "edge",
  "expect": {
    "status": [200, 201, 400, 422],
    "bodyNotContains": ["<script>alert(1)</script>"]
  },
  "mutation": "Set 'name' to XSS payload"
}
```

**Cases per endpoint:** `(5 * string_fields) + (4 * number_fields)`.

---

### 6. HTTP Method Mutations

**What it tests:** Sends requests using the wrong HTTP method to verify the API returns 405 Method Not Allowed (or equivalent). For a `GET` endpoint, it tests `POST`, `PUT`, `PATCH`, and `DELETE`.

**Generated test cases:**

| Case | Expected Status |
|------|-----------------|
| Each wrong method (4 per endpoint) | 405, 404, 400, or 301 |

**Example test case:**

```json
{
  "name": "DELETE /users/:id — wrong method (expected GET)",
  "category": "method",
  "request": { "method": "DELETE", "url": "http://localhost:3000/api/users/1" },
  "expect": { "status": [405, 404, 400, 301] }
}
```

**Cases per endpoint:** 4 (one for each wrong method from GET/POST/PUT/PATCH/DELETE).

---

## Test Methods

Test methods implement broader testing strategies. Unlike mutations that alter a single request, these methods generate purpose-built test suites that may span multiple requests, use external data sources, or produce artifacts like load test scripts.

### 7. CRUD Lifecycle

**What it tests:** Executes a complete Create-Read-Update-Delete lifecycle as a chained sequence of 7 dependent test cases. Verifies the full round-trip: POST creates a resource, GET reads it, PUT and PATCH update it, DELETE removes it, and subsequent GET/DELETE return 404.

**When to use:** Any resource with standard REST CRUD operations. Ideal as a first integration test for new entities.

**Developer input needed:** The wizard asks for `basePath` (e.g., `/users`), `createPayload`, `updatePayload`, and optionally `idField` (defaults to `id`).

**Generated test cases:**

| Step | Operation | Expected Status |
|------|-----------|-----------------|
| 1. Create | `POST /basePath` | 200 or 201 |
| 2. Read | `GET /basePath/:id` | 200 |
| 3. Full update | `PUT /basePath/:id` | 200 |
| 4. Partial update | `PATCH /basePath/:id` | 200 |
| 5. Delete | `DELETE /basePath/:id` | 200 or 204 |
| 6. Verify deleted | `GET /basePath/:id` | 404 |
| 7. Idempotent delete | `DELETE /basePath/:id` | 404 or 410 |

Test cases use `dependsOn` and `extractId`/`injectId` for chaining: step 1 extracts the resource ID, subsequent steps inject it into the URL.

**Example config:**

```typescript
const crudConfig: CrudConfig = {
  basePath: '/api/products',
  createPayload: { name: 'Widget', price: 9.99, sku: 'WDG-001' },
  updatePayload: { name: 'Updated Widget', price: 12.99 },
  idField: '_id',
};
```

**Cases per resource:** 7.

---

### 8. Contract / Schema Validation

**What it tests:** Validates that the API response matches a schema -- either provided from an OpenAPI spec or auto-inferred from the recorded happy-case response. Checks full schema match, per-field presence for required fields, per-field type correctness, and strict mode (no extra fields).

**When to use:** After API stabilization to prevent accidental contract breakage. Essential for public APIs and microservice boundaries.

**Developer input needed:** Optionally an OpenAPI schema. Without one, the schema is inferred from the recorded response body via recursive type detection.

**Generated test cases:**

| Case | Description |
|------|-------------|
| Schema match | Full response body matches expected schema |
| Field presence (per required field) | Each required field exists in response |
| Field type (per field) | Each field has the correct type |
| No extra fields | Response has no additional properties beyond schema (strict mode) |

**Example test case:**

```json
{
  "name": "GET /users — schema match",
  "category": "contract",
  "expect": {
    "status": 200,
    "schema": {
      "type": "object",
      "properties": {
        "id": { "type": "number" },
        "name": { "type": "string" },
        "email": { "type": "string" }
      },
      "required": ["id", "name", "email"],
      "additionalProperties": false
    }
  }
}
```

**Config options:** `openApiSchema` (optional) -- provide a `ContractSchema` object to override inference.

**Cases per endpoint:** `1 + required_fields + all_fields + 1` (schema + presence + type + strict).

---

### 9. Smoke Testing

**What it tests:** Replays every recorded happy-case request and asserts the response is not a 5xx server error. This is the lightest-weight test method -- it simply verifies all endpoints are reachable and not crashing.

**When to use:** CI pipelines, post-deployment health checks, or as a quick sanity check before running deeper test suites.

**Developer input needed:** None. Automatically generated from all recorded responses.

**Generated test cases:**

| Case | Expected Status |
|------|-----------------|
| Replay each recorded request | Any non-5xx (200, 201, 204, 301, 302, 304, 400, 401, 403, 404) |

**Example test case:**

```json
{
  "name": "Smoke GET /products — non-5xx",
  "category": "smoke",
  "description": "Replay happy case for GET /products, expect non-5xx",
  "expect": { "status": [200, 201, 204, 301, 302, 304, 400, 401, 403, 404] }
}
```

**Cases per endpoint:** 1. Filtered: recordings with status 0 or >= 500 are skipped.

---

### 10. Regression / Baseline

**What it tests:** Saves a structured snapshot (baseline) of each endpoint's response -- status code, body structure (field paths with types), and key field values. On subsequent runs, compares the current response against the baseline and reports diffs: missing fields, type changes, new unexpected fields, and value drift.

**When to use:** Detect unintended API changes between releases. Run after deploying to staging to catch regressions before production.

**Developer input needed:** An output directory for baseline files (defaults to `./api-tests`). Baselines are stored as `{outputDir}/baselines/{slug}.baseline.json`.

**Generated test cases:**

| Case | Description |
|------|-------------|
| Baseline match | Current response structure and status must match saved baseline |

**Diff detection includes:**

- Status code changes
- Missing fields from baseline
- Type changes on existing fields
- New fields not in baseline
- Key field value drift (top-level scalar values)

**Example baseline file:**

```json
{
  "endpoint": { "method": "GET", "path": "/api/users" },
  "status": 200,
  "bodyStructure": {
    "id": "number",
    "name": "string",
    "email": "string",
    "createdAt": "string"
  },
  "keyFields": { "id": 1, "name": "Alice" },
  "timestamp": "2026-08-13T10:00:00.000Z"
}
```

**Cases per endpoint:** 1.

---

### 11. Status Code Coverage

**What it tests:** Generates test cases targeting specific HTTP status codes (200, 400, 401, 403, 404, 405, 409, 422, 429) for each endpoint. Uses different strategies per code: happy-case replay for 200, malformed body for 400, removed auth for 401, invalid auth for 403, non-existent ID for 404, wrong HTTP method for 405, duplicate POST for 409, empty body for 422, and an informational 429 marker.

**When to use:** Verify your API's error handling covers all standard HTTP status codes. Good for API compliance audits.

**Developer input needed:** None. Requires auth config for 401/403 tests.

**Generated test cases:**

| Case | Strategy | Expected Status |
|------|----------|-----------------|
| Happy case | Replay recorded request | 200/201/204 |
| Bad request | Send malformed body (POST/PUT/PATCH only) | 400 or 422 |
| Unauthorized | Remove auth credentials | 401 or 403 |
| Forbidden | Send wrong-role credentials | 401 or 403 |
| Not found | Replace last URL segment with nonexistent ID | 404 or 400 |
| Method not allowed | Send wrong HTTP method | 405, 404, or 400 |
| Conflict | Duplicate POST (same payload) | 409, 400, 422, 200, or 201 |
| Unprocessable | Send empty object body | 422 or 400 |
| Rate limit | Informational marker (single request) | 200 or 429 |

**Cases per endpoint:** 5-9, depending on method type and auth configuration.

---

### 12. Security (Deep Injection)

**What it tests:** Comprehensive injection testing across all input surfaces: body fields, query parameters, path parameters, and headers. Includes 6 SQL injection payloads, 5 NoSQL injection payloads, 6 command injection payloads, 5 SSTI (Server-Side Template Injection) payloads, 5 path traversal payloads, and 3 CRLF/header injection payloads. Verifies responses contain no stack traces, no data leaks, and no evaluated template expressions.

**When to use:** Security audits, pre-production reviews, compliance checks. Should be run at least once per release.

**Developer input needed:** None by default. Optionally provide custom `SecurityPayloads` to extend or replace the default payload sets.

**Generated test cases (per string body field):**

| Attack Vector | Payloads | Response Must NOT Contain |
|---------------|----------|---------------------------|
| SQL injection | `' OR 1=1--`, `DROP TABLE`, `UNION SELECT`, etc. | `syntax error`, `SQL`, `mysql`, `postgresql`, `sqlite`, `ORA-` |
| NoSQL injection | `{"$gt":""}`, `{"$ne":null}`, `{"$regex":".*"}`, etc. | Stack traces, data leak indicators |
| Command injection | `; ls`, `\| cat /etc/passwd`, `` `whoami` ``, etc. | `root:x:0:0`, `/bin/bash`, `uid=`, etc. |
| SSTI | `{{7*7}}`, `${7*7}`, `<%= 7*7 %>`, etc. | `49` (evaluated result), stack traces |
| Path traversal | `../../etc/passwd`, URL-encoded variants, Windows paths | `root:x:0:0`, `BEGIN RSA`, `private_key`, etc. |

**Additional surfaces:**

- Query params: top 3 SQLi + top 2 CMDi payloads per query parameter
- Path params: top 2 path traversal + top 2 SQLi payloads per path parameter
- Headers: 3 CRLF injection payloads via `X-Custom-Test` header

**Config options:** `payloads: SecurityPayloads` -- override any payload category with your own list.

**Cases per endpoint:** Highly variable. Formula: `(string_fields * 30) + (query_params * 5) + (path_params * 4) + 3`.

---

### 13. Performance / Latency

**What it tests:** Generates latency threshold test cases for p50, p95, and p99 percentiles. Includes a `measureEndpoint` function that performs N iterations of a request, collects timing data, and computes percentile statistics (min, max, mean, p50, p95, p99).

**When to use:** CI performance gates, SLA verification, detecting performance regressions between releases.

**Developer input needed:** Optional thresholds and iteration count.

**Generated test cases:**

| Case | Default Threshold |
|------|-------------------|
| p50 latency | <= 200ms |
| p95 latency | <= 500ms |
| p99 latency | <= 1000ms |

**Example config:**

```typescript
const perfConfig: PerformanceConfig = {
  thresholds: { p50: 100, p95: 300, p99: 800 },
  iterations: 20,
};
```

**Config options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `thresholds.p50` | number (ms) | 200 | Median latency threshold |
| `thresholds.p95` | number (ms) | 500 | 95th percentile threshold |
| `thresholds.p99` | number (ms) | 1000 | 99th percentile threshold |
| `iterations` | number | 10 | Number of requests for measurement |

**Cases per endpoint:** 3.

---

### 14. Spec Drift Detection

**What it tests:** Loads an OpenAPI specification (JSON or YAML) and generates test cases that verify the live API still matches the spec. Checks that endpoints return documented status codes, response body schemas match spec-defined fields (with `$ref` and `allOf` resolution), and required parameters are documented.

**When to use:** API-first development workflows. Run in CI to catch when implementation diverges from the spec. Essential when the spec is the source of truth for clients, SDKs, or documentation.

**Developer input needed:** Path to the OpenAPI spec file.

**Generated test cases:**

| Case | Description |
|------|-------------|
| Status code match | Response status is one of the documented status codes for this operation |
| Response schema match | Response body fields match spec-defined schema (success responses) |
| Required params documented | Spec-required parameters are present |

**Example config:**

```typescript
const driftConfig: SpecDriftConfig = {
  specPath: './openapi.json',
};
```

**Config options:**

| Field | Type | Description |
|-------|------|-------------|
| `specPath` | string | Path to OpenAPI spec (JSON or YAML). YAML requires `js-yaml` package. |

**Cases per endpoint:** 1-3, depending on spec detail (status codes, response schema, required params).

---

### 15. Boundary Testing

**What it tests:** Exhaustive boundary value analysis for every field type. Goes beyond edge case mutations by covering type-specific boundaries: string lengths, email format variants, UUID validity, ISO date edge cases, integer overflow, float special values (NaN, Infinity), boolean coercion, and array depth/size. Also tests query parameter boundaries.

**When to use:** Thorough input validation testing. When you need to verify every possible edge of a field's valid range.

**Developer input needed:** None. Uses the inferred payload schema to determine field types and patterns (email, uuid, iso-date).

**Boundaries by field type/pattern:**

| Type/Pattern | Boundary Cases |
|-------------|----------------|
| string | empty, 1 char, 10,000 chars, 10,001 chars, whitespace only, unicode surrogate, null bytes |
| email | valid, missing @, double @, very long local (256 chars), unicode domain, no domain, no local |
| uuid | valid, short, non-hex chars, empty, no dashes |
| date (ISO) | valid, invalid format, epoch 0, far future (9999), far past (1900), date only, invalid month, invalid day |
| integer | 0, -1, 1, MAX_SAFE_INTEGER, MIN_SAFE_INTEGER, MAX+1 overflow, decimal (invalid int) |
| float | 0.0, -0.1, very small (1e-300), very large (1e+300), NaN, Infinity, -Infinity |
| boolean | true, false, string "true", number 1, number 0, null |
| array | empty, 1 item, 100 items, deeply nested, null in array |
| query params | empty, very long (8000 chars), whitespace only |

**Cases per endpoint:** `sum(boundaries_per_field) + (query_params * 3)`.

---

### 16. Negative / Malformed Testing

**What it tests:** Sends deliberately malformed or hostile requests to verify the API returns proper error responses without crashing. Targets body format (empty, invalid JSON, null, array-when-object-expected, 100-level deep nesting), Content-Type mismatches, duplicate query parameters, very long URLs (8000+ chars), and oversized headers (16KB).

**When to use:** Hardening endpoints against unexpected input. Complements boundary testing by focusing on structural malformations rather than field values.

**Developer input needed:** None.

**Generated test cases (for endpoints with body):**

| Case | Expected Status |
|------|-----------------|
| Empty body with JSON Content-Type | 400 or 422 |
| Invalid JSON string body | 400 or 422 |
| Null body | 400 or 422 |
| Array when object expected | 400 or 422 |
| 100-level nested object | 400, 413, or 422 |
| Wrong Content-Type (text/plain) | 400, 415, or 422 |
| Missing Content-Type header | 400, 415, or 422 |

**For all endpoints:**

| Case | Expected Status |
|------|-----------------|
| Duplicate query param | 200, 400, or 422 |
| Very long URL (8000+ chars) | 400, 414, or 431 |
| Very long header (16KB) | 400 or 431 |

**Cases per endpoint:** 3 (GET/DELETE) or 10 (POST/PUT/PATCH), plus 1 if query params present.

---

### 17. Multi-Step Flow

**What it tests:** Executes a user-defined sequence of API calls as a chained flow. Each step can extract variables from responses (e.g., tokens, IDs) and inject them into subsequent steps via `{{variable}}` template syntax. Supports variable substitution in URLs, headers, and body fields.

**When to use:** Testing business workflows that span multiple endpoints: login then access protected resource, create order then add items then checkout, onboarding flows with dependent steps.

**Developer input needed:** A `FlowConfig` defining the step sequence.

**Example config:**

```typescript
const flow: FlowConfig = {
  name: 'User Registration Flow',
  steps: [
    {
      name: 'Register',
      method: 'POST',
      path: '/auth/register',
      body: { email: 'test@example.com', password: 'secret123' },
      extract: { userId: '$.id', token: '$.token' },
      expect: { status: 201 },
    },
    {
      name: 'Get Profile',
      method: 'GET',
      path: '/users/{{userId}}',
      headers: { Authorization: 'Bearer {{token}}' },
      expect: { status: 200 },
    },
    {
      name: 'Update Profile',
      method: 'PATCH',
      path: '/users/{{userId}}',
      headers: { Authorization: 'Bearer {{token}}' },
      body: { name: 'Updated Name' },
      expect: { status: 200 },
    },
  ],
};
```

**Config options:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Flow name (used in test case names) |
| `steps[].name` | string | Step description |
| `steps[].method` | string | HTTP method |
| `steps[].path` | string | URL path (supports `{{var}}` substitution) |
| `steps[].body` | any | Request body (supports deep `{{var}}` substitution) |
| `steps[].headers` | Record | Extra headers (merged with base headers) |
| `steps[].extract` | Record | Variables to extract from response (key = var name, value = JSON path) |
| `steps[].expect.status` | number or number[] | Expected status code(s) |

**Cases per flow:** Equal to the number of steps.

---

### 18. Parameterized / Data-Driven

**What it tests:** Runs the same endpoint with multiple data rows, sourcing data from inline arrays, CSV files, or JSON files. Each row produces one test case with `{{placeholder}}` values substituted into the URL, body, and headers. Rows can override expected status with a `_expect.status` field.

**When to use:** Testing an endpoint with many valid/invalid input combinations. Verifying search with different queries, user creation with various roles, or validation rules with specific edge-case inputs.

**Developer input needed:** A `ParameterizedConfig` specifying the endpoint template and data source.

**Example config (inline):**

```typescript
const paramConfig: ParameterizedConfig = {
  endpoint: {
    method: 'POST',
    path: '/api/users',
    body: { name: '{{name}}', email: '{{email}}', role: '{{role}}' },
  },
  dataSource: 'inline',
  data: [
    { name: 'Alice', email: 'alice@test.com', role: 'admin' },
    { name: 'Bob', email: 'bob@test.com', role: 'viewer' },
    { name: '', email: 'invalid', role: 'unknown', _expect: { status: 422 } },
  ],
  expectPerRow: { status: 201 },
};
```

**Config options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | EndpointConfig | required | Template endpoint with `{{var}}` placeholders |
| `dataSource` | `'inline' \| 'csv' \| 'json'` | required | Where to load data from |
| `data` | any[] | required for inline | Data rows |
| `filePath` | string | -- | Path to CSV or JSON file |
| `expectPerRow` | `{ status: number }` | 200 | Default expected status (overridable per row via `_expect`) |

**Cases per endpoint:** One per data row.

---

### 19. Rate Limiting

**What it tests:** Verifies rate limiting behavior by generating burst request test cases. Auto-detects the rate limit from response headers (`X-RateLimit-Limit`, `RateLimit-Limit`, etc.) and uses limit+1 as the burst count. Tests that exceeding the limit returns 429, that `Retry-After` header is present on 429 responses, and that remaining-count headers decrement correctly.

**When to use:** APIs with rate limiting middleware (e.g., `@nestjs/throttler`, Express rate-limit).

**Developer input needed:** Optional burst count override and endpoint selection.

**Generated test cases:**

| Case | Description |
|------|-------------|
| Burst requests | Send N rapid sequential requests; last should get 429 |
| Retry-After header | 429 response must include `Retry-After` header |
| Header decrement | (When limit detected) Remaining count decrements across requests |

**Config options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | EndpointConfig | required | Endpoint to test |
| `burstCount` | number | 50 (or auto-detected + 1) | Number of burst requests |
| `detectFromHeaders` | boolean | true | Auto-detect limit from happy-case response headers |

**Cases per endpoint:** 2-3.

---

### 20. Pagination

**What it tests:** Auto-detects pagination style (offset/page-based or cursor-based) from response body and query parameters. Generates tests for page overlap prevention, empty/last page behavior, edge cases (limit=0, limit=-1, limit=10000), cursor following, and total count consistency.

**When to use:** Any list endpoint with pagination.

**Developer input needed:** None. The system auto-detects pagination by looking for common field names (`data`, `items`, `total`, `page`, `limit`, `cursor`, `next`, etc.).

**Auto-detected parameters:**

| Category | Recognized Names |
|----------|-----------------|
| Page params | `page`, `p`, `pageNumber`, `page_number` |
| Limit params | `limit`, `size`, `per_page`, `perPage`, `pageSize`, `page_size`, `count` |
| Offset params | `offset`, `skip`, `start` |
| Cursor params | `cursor`, `after`, `before`, `next_cursor`, `nextCursor`, `continuation` |
| Total fields | `total`, `totalCount`, `total_count`, `totalItems`, `total_items`, `count` |
| Data fields | `data`, `items`, `results`, `records`, `rows`, `entries`, `list`, `content` |
| Next cursor fields | `next`, `nextCursor`, `next_cursor`, `cursor`, `nextPageToken`, `continuation` |

**Generated test cases:**

| Case | Expected Status |
|------|-----------------|
| Page 1 vs Page 2 no overlap | 200 |
| Last page items <= limit | 200 or 404 |
| Beyond last page | 200 or 404 |
| limit=0 | 200 or 400 |
| limit=-1 (invalid) | 400 or 422 |
| limit=10000 (very large) | 200 or 400 |
| Cursor follow next (cursor-based only) | 200 |
| Total count consistency (when total detected) | 200 |

**Cases per endpoint:** 6-8.

---

### 21. Auth / Role Matrix (RBAC)

**What it tests:** Tests every combination of endpoint and role to verify access control. For each entry in the matrix: verifies no-auth returns 401, allowed roles return 200/201/204, and denied roles return 403. Supports Bearer tokens and API keys.

**When to use:** APIs with role-based access control. Define your roles and permission matrix once, and the generator produces a complete RBAC test suite.

**Developer input needed:** A full `AuthMatrixConfig` defining roles (with tokens) and the permission matrix.

**Example config:**

```typescript
const matrixConfig: AuthMatrixConfig = {
  roles: [
    { name: 'admin', token: 'admin-jwt-token-here' },
    { name: 'editor', token: 'editor-jwt-token-here' },
    { name: 'viewer', token: 'viewer-jwt-token-here', tokenType: 'bearer' },
  ],
  matrix: [
    { endpoint: 'GET /users', allowedRoles: ['admin', 'editor', 'viewer'] },
    { endpoint: 'POST /users', allowedRoles: ['admin'] },
    { endpoint: 'DELETE /users/:id', allowedRoles: ['admin'] },
  ],
};
```

**Generated test cases (per matrix entry):**

| Case | Expected Status |
|------|-----------------|
| No auth | 401 |
| Allowed role | 200, 201, or 204 |
| Denied role | 403 |

**Config options:**

| Field | Type | Description |
|-------|------|-------------|
| `roles[].name` | string | Role identifier |
| `roles[].token` | string | Auth token for this role |
| `roles[].tokenType` | `'bearer' \| 'api-key'` | Token type (default: bearer) |
| `roles[].headerName` | string | Header name for API key (default: `X-API-Key`) |
| `matrix[].endpoint` | string | `"METHOD /path"` format |
| `matrix[].allowedRoles` | string[] | Roles that should have access |

**Cases per matrix entry:** `1 + number_of_roles`.

---

### 22. CORS / Security Headers

**What it tests:** Validates CORS policy by sending OPTIONS preflight requests from same-origin, allowed origins, and disallowed origins. Checks for wildcard `Access-Control-Allow-Origin: *` (security flag), credentials-with-wildcard violations, and the presence of security headers (`X-Content-Type-Options`, `X-Frame-Options`, HSTS) on actual requests.

**When to use:** Any browser-facing API. Critical for APIs consumed by SPAs or cross-origin clients.

**Developer input needed:** Optional lists of allowed and disallowed origins.

**Generated test cases:**

| Case | Description | Expected Status |
|------|-------------|-----------------|
| Same origin preflight | OPTIONS from same origin | 200 or 204, must have `access-control-allow-origin` |
| Allowed origins | OPTIONS from each allowed origin | 200 or 204, must have CORS headers |
| Disallowed origins | OPTIONS from evil origins | 200, 204, or 403 (should NOT reflect CORS headers) |
| Wildcard check | Probe for `*` in allow-origin | 200, 204, or 403 |
| Credentials + wildcard | Probe for invalid credentials+wildcard combo | 200, 204, or 403 |
| Security headers | Check for `x-content-type-options` on actual request | 200/201/204 |

**Config options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | EndpointConfig | required | Endpoint to test |
| `allowedOrigins` | string[] | `[same origin]` | Origins that should be allowed |
| `disallowedOrigins` | string[] | `['https://evil.example.com', 'http://attacker.test']` | Origins that should be rejected |

**Cases per endpoint:** `3 + allowed_origins + disallowed_origins` (default: 6).

---

### 23. Pairwise / Combinatorial

**What it tests:** Generates a minimal covering array of all 2-way (pairwise) combinations of parameter values using a greedy algorithm. Instead of testing all `N^M` combinations (which can be millions), pairwise testing covers every pair of values between any two parameters with far fewer test cases. Supports parameters in body, query, header, or path locations.

**When to use:** Endpoints with many interacting parameters where exhaustive testing is impractical. Covers the vast majority of interaction bugs (most bugs involve at most 2 interacting factors).

**Developer input needed:** A `PairwiseConfig` defining the parameters and their value domains.

**Example config:**

```typescript
const pairwiseConfig: PairwiseConfig = {
  endpoint: { method: 'POST', path: '/api/search' },
  parameters: [
    { field: 'category', values: ['electronics', 'books', 'clothing'], location: 'body' },
    { field: 'sort', values: ['price', 'rating', 'date'], location: 'query' },
    { field: 'order', values: ['asc', 'desc'], location: 'query' },
    { field: 'limit', values: [10, 50, 100], location: 'query' },
  ],
};
// 3 * 3 * 2 * 3 = 54 exhaustive combinations
// Pairwise: ~9-12 test cases covering all 2-way pairs
```

**Config options:**

| Field | Type | Description |
|-------|------|-------------|
| `endpoint` | EndpointConfig | Endpoint template |
| `parameters[].field` | string | Parameter name |
| `parameters[].values` | any[] | Domain of values to combine |
| `parameters[].location` | `'body' \| 'query' \| 'header' \| 'param'` | Where the parameter goes |

**Cases per endpoint:** Depends on the covering array size. Typically `O(max_values^2 * log(num_params))`.

---

### 24. Fuzzing

**What it tests:** Randomized input testing using a seedable PRNG (xorshift32) for reproducibility. Generates random values for specified fields across body, query, and header locations. String fuzzing includes format strings (`%s%n`), template injection (`{{template}}`), XSS, SQLi, path traversal, prototype pollution (`__proto__`), and random-length strings. Number fuzzing covers special values (NaN, Infinity, MAX_VALUE) and random ranges. After execution, results are scored by severity: HIGH (5xx crash), MEDIUM (error with stack trace leak), LOW (expected error), NONE (normal response).

**When to use:** Finding unexpected crashes and edge cases that structured tests miss. Run with high iteration counts in nightly builds.

**Developer input needed:** A `FuzzConfig` defining target fields and iteration count.

**Example config:**

```typescript
const fuzzConfig: FuzzConfig = {
  endpoint: { method: 'POST', path: '/api/users', body: { name: '', email: '' } },
  fields: [
    { name: 'name', type: 'string', location: 'body' },
    { name: 'email', type: 'string', location: 'body' },
  ],
  iterations: 500,
  seed: 42,
};
```

**Config options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | EndpointConfig | required | Target endpoint |
| `fields` | FuzzField[] | required | Fields to fuzz |
| `iterations` | number | 100 | Number of fuzz iterations |
| `seed` | number | 42 | PRNG seed for reproducibility |

**Severity scoring:**

| Severity | Condition |
|----------|-----------|
| HIGH | 5xx status (server crash) |
| MEDIUM | 4xx with stack trace in body |
| LOW | 4xx without stack trace |
| NONE | 2xx (normal response) |

**Cases per endpoint:** Equal to `iterations`.

---

### 25. State Machine

**What it tests:** Models an entity's state transitions and generates test cases for valid transitions, invalid transitions, self-transitions, and terminal state violations. Creates a resource, then walks through each defined transition. Also generates negative tests for every state pair NOT in the transition list, and verifies that terminal states (states with no outgoing transitions) reject all transition attempts.

**When to use:** Entities with lifecycle states: orders (pending -> confirmed -> shipped -> delivered), tickets (open -> in_progress -> resolved -> closed), invoices (draft -> sent -> paid -> void).

**Developer input needed:** A `StateMachineConfig` defining the resource, states, and allowed transitions.

**Example config:**

```typescript
const smConfig: StateMachineConfig = {
  resource: 'Order',
  basePath: '/api/orders',
  stateField: 'status',
  initialState: 'pending',
  states: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
  transitions: [
    { from: 'pending', to: 'confirmed', method: 'PATCH' },
    { from: 'confirmed', to: 'shipped', method: 'PATCH' },
    { from: 'shipped', to: 'delivered', method: 'PATCH' },
    { from: 'pending', to: 'cancelled', method: 'PATCH' },
  ],
  createPayload: { product: 'Widget', quantity: 1 },
};
```

**Generated test cases:**

| Category | Description | Expected Status |
|----------|-------------|-----------------|
| Create | POST to create resource | 200 or 201 |
| Valid transitions | Each defined transition | 200 or 204 |
| Invalid transitions | Every undefined state pair | 400, 422, or 409 |
| Self-transitions | Same state to same state | 200, 400, or 422 |
| Terminal violations | Transitions from terminal states | 400, 422, or 409 |

**Config options:**

| Field | Type | Description |
|-------|------|-------------|
| `resource` | string | Resource name (used in test case names) |
| `basePath` | string | REST base path for the resource |
| `stateField` | string | Field name holding the state |
| `states` | string[] | All possible states |
| `transitions` | StateTransition[] | Allowed transitions (from, to, method, optional path/body) |
| `createPayload` | any | Body for the initial POST create |
| `initialState` | string | Expected state after creation |

**Cases per resource:** `1 + transitions + (states^2 - transitions - states) + states + (terminal_states * (states - 1))`.

---

### 26. Load Test Scaffold

**What it tests:** Does not generate test cases directly. Instead, produces ready-to-run **k6 scripts** and **autocannon configs** for each recorded endpoint. k6 scripts include staged load ramps (default: 10 -> 50 -> 0 VUs), p95 latency thresholds, and failure rate thresholds. Autocannon configs include connection count and duration.

**When to use:** When you need load testing scripts but do not want to write them manually. The generated scripts serve as a starting point for production load testing.

**Developer input needed:** Optional load test configuration.

**Generated artifacts:**

| File | Tool | Description |
|------|------|-------------|
| `load/k6/{endpoint}.js` | k6 | Complete k6 script with stages, thresholds, and checks |
| `load/autocannon/config.json` | autocannon | Combined config for all endpoints |
| `load/README.md` | -- | Usage instructions |

**Example k6 output:**

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

export default function () {
  const res = http.get('http://localhost:3000/api/products', { headers });
  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

**Config options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `stages` | `{ duration: string; target: number }[]` | 30s->10, 1m->50, 30s->0 | k6 load stages |
| `p95Threshold` | number (ms) | 500 | p95 latency threshold for k6 |
| `maxFailRate` | number (0-1) | 0.05 | Max acceptable failure rate |
| `connections` | number | 10 | autocannon concurrent connections |
| `duration` | number (seconds) | 30 | autocannon test duration |

**Files per endpoint:** 1 k6 script + 1 autocannon config entry.

---

## Quick Reference Table

| # | Method | Category | Auto-Gen? | Cases per Endpoint | Input Required |
|---|--------|----------|-----------|-------------------|----------------|
| 1 | Auth Mutations | mutation | Yes | 3-4 | Auth config |
| 2 | Body Mutations | mutation | Yes | Variable (field count) | Schema |
| 3 | Params Mutations | mutation | Yes | 2-4 per param | Path params |
| 4 | Headers Mutations | mutation | Yes | 1-3 | None |
| 5 | Edge Case Mutations | mutation | Yes | Variable (field count) | Schema |
| 6 | HTTP Method Mutations | mutation | Yes | 4 | None |
| 7 | CRUD Lifecycle | method | Config | 7 | CrudConfig |
| 8 | Contract / Schema | method | Yes | Variable (field count) | Optional OpenAPI schema |
| 9 | Smoke Testing | method | Yes | 1 | None |
| 10 | Regression / Baseline | method | Yes | 1 | Output directory |
| 11 | Status Code Coverage | method | Yes | 5-9 | Optional auth config |
| 12 | Security (Deep Injection) | method | Yes | 30+ per string field | Optional custom payloads |
| 13 | Performance / Latency | method | Yes | 3 | Optional thresholds |
| 14 | Spec Drift Detection | method | Config | 1-3 per spec operation | OpenAPI spec path |
| 15 | Boundary Testing | method | Yes | Variable (field count) | Schema |
| 16 | Negative / Malformed | method | Yes | 3-10 | None |
| 17 | Multi-Step Flow | method | Config | Per step count | FlowConfig |
| 18 | Parameterized | method | Config | Per data row | ParameterizedConfig |
| 19 | Rate Limiting | method | Config | 2-3 | RateLimitConfig |
| 20 | Pagination | method | Yes | 6-8 | None (auto-detected) |
| 21 | Auth / Role Matrix | method | Config | 1 + roles per entry | AuthMatrixConfig |
| 22 | CORS / Security Headers | method | Config | 6+ | Optional origin lists |
| 23 | Pairwise / Combinatorial | method | Config | Covering array size | PairwiseConfig |
| 24 | Fuzzing | method | Config | Per iterations | FuzzConfig |
| 25 | State Machine | method | Config | Variable (state count) | StateMachineConfig |
| 26 | Load Test Scaffold | method | Yes | Files, not cases | Optional LoadTestConfig |

**Auto-Gen** = automatically generated from recorded responses. **Config** = requires explicit configuration from the developer.

---

## Choosing the Right Methods

### Decision Flowchart

```
Is this a new API launch?
  YES --> Smoke + Contract + Auth Mutations + CRUD Lifecycle + Status Codes
  NO  --> Is this a security audit?
            YES --> Security + Edge Case + Boundary + Fuzzing + CORS
            NO  --> Is this a performance gate?
                      YES --> Performance + Load Test Scaffold + Rate Limiting
                      NO  --> Is this a regression check?
                                YES --> Regression + Contract + Spec Drift
                                NO  --> Pick methods based on the specific concern.
```

### Recommended Combinations

**API Launch** (first-time test suite):
- Smoke Testing (sanity check)
- Contract / Schema Validation (lock the API shape)
- Auth Mutations (verify security basics)
- CRUD Lifecycle (integration coverage)
- Status Code Coverage (error handling)
- Body Mutations + Params Mutations (input validation)

**Security Audit**:
- Security (Deep Injection) (SQLi, NoSQLi, CMDi, SSTI, path traversal)
- Edge Case Mutations (XSS, SQL injection, long strings)
- Boundary Testing (exhaustive field boundaries)
- Fuzzing (randomized crash detection)
- CORS / Security Headers (browser security)
- Negative / Malformed (structural abuse)

**Performance Gate** (CI pipeline):
- Performance / Latency (p50/p95/p99 thresholds)
- Load Test Scaffold (k6 + autocannon scripts)
- Rate Limiting (verify throttling works)

**Regression Guard** (between releases):
- Regression / Baseline (structural diff detection)
- Contract / Schema Validation (schema lock)
- Spec Drift Detection (OpenAPI compliance)
- Smoke Testing (nothing crashed)

**RBAC Compliance**:
- Auth / Role Matrix (exhaustive role x endpoint coverage)
- Auth Mutations (credential tampering)
- Status Code Coverage (401/403 verification)

**Complex Workflows**:
- Multi-Step Flow (chained dependent requests)
- State Machine (lifecycle state transitions)
- CRUD Lifecycle (basic CRUD chain)
- Parameterized / Data-Driven (many input variations)

**Input Validation Deep-Dive**:
- Boundary Testing (every field edge case)
- Pairwise / Combinatorial (parameter interaction coverage)
- Body Mutations (field-level validation)
- Edge Case Mutations (adversarial values)
- Negative / Malformed (structural malformations)
