# API Testing CLI

## What It Is

`@nestjs-boot/api-test` is an interactive CLI that records live API responses (happy cases) and auto-generates mutation test suites. It sends real HTTP requests to your server, captures the baseline responses, then produces dozens of negative test cases by systematically mutating authentication, request bodies, URL parameters, headers, HTTP methods, and edge-case payloads.

The generated tests are stored as JSON files, so they are framework-agnostic and can run anywhere Node.js 18+ is available.

**Key capabilities:**

- Interactive wizard to configure host, auth, headers, and endpoints
- Records baseline (happy-case) responses from a live server
- Auto-generates mutation tests across 6 categories
- Runs tests with console, JSON, and HTML reports
- Re-records and regenerates when your API changes
- Zero runtime dependencies (optional `@clack/prompts` and `picocolors` for nicer UI)

## Installation

```bash
npm install @nestjs-boot/api-test
```

Or as a dev dependency:

```bash
npm install -D @nestjs-boot/api-test
```

Requires **Node.js >= 18.0.0** (uses native `fetch` and `AbortSignal.timeout`).

## Quick Start

1. Start your API server.
2. Run the wizard:

```bash
npx api-test generate
```

3. Walk through the interactive prompts (host, auth, endpoints, mutation categories).
4. The CLI records happy-case responses and generates test suites.
5. Run the tests:

```bash
npx api-test run
```

## Commands Reference

| Command    | Description                                                |
| ---------- | ---------------------------------------------------------- |
| `generate` | Interactive wizard to configure and generate tests (default) |
| `run`      | Execute generated test suites against a live server        |
| `update`   | Re-record happy cases and regenerate all tests             |
| `add`      | Add new endpoints to an existing configuration             |
| `help`     | Show CLI help text                                         |

### Global Options

| Option             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `--config <path>`  | Path to config file (default: `./api-tests/config.json`) |
| `--report html`    | Generate an HTML report (used with `run`)             |
| `--filter <cat>`   | Filter tests by category: `auth\|body\|params\|headers\|edge\|method` |
| `--bail`           | Stop on the first test failure                        |

## Wizard Steps Explained

When you run `npx api-test generate`, the wizard walks through these steps:

### 1. Base URL

```
Base URL? (http://localhost:3000)
```

The root URL of your running API server.

### 2. Base Path

```
Base path? (optional, e.g. /api/v1)
```

A prefix prepended to all endpoint paths. Leave empty if your routes are at the root.

### 3. Authentication

```
Authentication method?
  1) Bearer Token
  2) API Key
  3) Cookie
  4) Basic Auth
  5) None
```

Depending on the selection, the wizard asks for the relevant credentials (token, header name, cookie name/value, or username/password). These credentials are used for all recorded requests and become the baseline for auth mutation tests.

### 4. Global Headers

```
Add global headers? (y/n)
```

Add custom headers sent with every request (e.g., `X-Tenant-Id`, `Accept-Language`).

### 5. Endpoints

For each endpoint the wizard asks:

- **HTTP Method** (GET, POST, PUT, PATCH, DELETE)
- **Path** (e.g., `/users/:id`) -- path params detected automatically from `:param` syntax
- **Description** (optional)
- **Path param values** (prompted per detected `:param`)
- **Request body** (JSON, for POST/PUT/PATCH)
- **Query params** (`key=value&key2=value2`)
- **Extra headers** (`key:value, key2:value2`)

You can add as many endpoints as needed.

### 6. Mutation Categories

```
Which mutation categories?
  1) Auth (token/key removal, invalid)
  2) Body (missing fields, wrong types)
  3) Params (invalid, missing, special chars)
  4) Headers (content-type, accept)
  5) Edge (XSS, SQL injection, long strings)
  6) Method (wrong HTTP method)
```

Select which categories of mutation tests to generate. All are selected by default.

### 7. Output Directory

```
Output directory? (./api-tests)
```

Where recordings, generated tests, config, and reports are stored.

### 8. Confirmation

The wizard shows a summary and asks for confirmation before recording.

## Mutation Categories

### Auth

Tests authentication enforcement. Only generated when auth is configured.

| Test Case               | What It Does                            | Expected Status |
| ----------------------- | --------------------------------------- | --------------- |
| No auth                 | Removes the auth header/cookie entirely | 401 or 403      |
| Invalid credentials     | Sends garbage token/key/cookie          | 401 or 403      |
| Empty auth value        | Sends an empty token string             | 401 or 403      |
| Malformed JWT           | Sends a non-JWT string (bearer only)    | 401 or 403      |

### Body

Tests request body validation. Only generated for POST/PUT/PATCH with a JSON body.

| Test Case          | What It Does                         | Expected Status |
| ------------------ | ------------------------------------ | --------------- |
| Missing field      | Removes each top-level field         | 400 or 422      |
| Wrong type         | Sends number instead of string (and vice versa) | 400 or 422 |
| Null value         | Sets each field to `null`            | 400 or 422      |
| Empty body `{}`    | Sends an empty object                | 400 or 422      |
| No body            | Removes body and Content-Type        | 400 or 422      |
| Array body         | Wraps the object in an array         | 400 or 422      |
| Extra unknown field | Adds `__unknown_field_xyz`           | 200, 201, 400, or 422 |

### Params

Tests URL parameter validation. Only generated for endpoints with `:param` path segments.

| Test Case        | What It Does                                  | Expected Status |
| ---------------- | --------------------------------------------- | --------------- |
| Invalid format   | Sends `abc-not-valid` for numeric/ObjectId/UUID params | 400, 404, or 422 |
| Non-existent     | Sends `999999999` or a zero ObjectId           | 404             |
| Empty            | Sends an empty string                          | 400, 404, or 405 |
| Special chars    | Sends `<script>alert(1)</script>`              | 400, 404, or 422 |

The generator auto-detects param types (numeric, MongoDB ObjectId, UUID) and tailors tests accordingly.

### Headers

Tests Content-Type and Accept header handling.

| Test Case           | What It Does                         | Expected Status |
| ------------------- | ------------------------------------ | --------------- |
| No Content-Type     | Removes Content-Type from body requests | 400, 415, or 422 |
| Wrong Content-Type  | Sends `text/plain` instead of `application/json` | 400, 415, or 422 |
| No Accept           | Removes Accept header (should still work) | 200, 201, or 204 |

### Edge

Tests security and boundary conditions on string and number fields.

| Test Case        | What It Does                        | Expected Status | Extra Check |
| ---------------- | ----------------------------------- | --------------- | ----------- |
| Empty string     | Sets field to `""`                  | 400, 422, 200, 201 | -- |
| Very long string | Sets field to 10,000 chars          | 400, 413, or 422 | -- |
| XSS payload      | Sets field to `<script>alert(1)</script>` | 200, 201, 400, 422 | Body must NOT contain the raw script tag |
| SQL injection    | Sets field to `' OR 1=1 --`         | 200, 201, 400, 422 | Body must NOT contain SQL error keywords |
| Null character   | Sets field to `\u0000`              | 200, 201, 400, 422 | -- |
| Zero             | Sets numeric field to `0`           | 200, 201, 400, 422 | -- |
| Negative         | Sets numeric field to `-1`          | 200, 201, 400, 422 | -- |
| MAX_SAFE_INTEGER | Sets numeric field to `9007199254740991` | 200, 201, 400, 422 | -- |
| Float            | Sets numeric field to `1.5`         | 200, 201, 400, 422 | -- |

### Method

Tests that the server rejects wrong HTTP methods.

| Test Case     | What It Does                              | Expected Status |
| ------------- | ----------------------------------------- | --------------- |
| Wrong method  | Sends every other HTTP method (4 per endpoint) | 405, 404, 400, or 301 |

## Output Structure

After `generate`, the output directory contains:

```
api-tests/
  config.json              # Full configuration (host, auth, endpoints, categories)
  recordings/
    GET_users.json         # Recorded happy-case response per endpoint
    POST_users.json
  generated/
    GET_users.test.json    # Generated test suite per endpoint
    POST_users.test.json
```

File names are derived from the HTTP method and path (e.g., `POST_users_id` for `POST /users/:id`).

Each `.test.json` file contains a `TestSuite` object:

```json
{
  "endpoint": { "method": "POST", "path": "/users", "body": { "name": "John" } },
  "happyCase": { "status": 201, "body": { "id": 1, "name": "John" }, "duration": 42 },
  "testCases": [
    {
      "id": "body_1",
      "name": "POST /users — missing 'name'",
      "category": "body",
      "description": "Remove required field 'name'",
      "request": { "method": "POST", "url": "http://localhost:3000/users", "headers": {}, "body": {} },
      "expect": { "status": [400, 422] },
      "mutation": "Removed field 'name'"
    }
  ]
}
```

## Running Tests

Run all generated tests against a live server:

```bash
npx api-test run
```

### Filter by Category

```bash
npx api-test run --filter auth
npx api-test run --filter edge
```

### Stop on First Failure

```bash
npx api-test run --bail
```

### Generate Reports

JSON reports are always saved to `api-tests/reports/`. For an HTML report:

```bash
npx api-test run --report html
```

### Use a Custom Config

```bash
npx api-test run --config ./path/to/config.json
```

### Console Output

The runner prints results per endpoint with PASS/FAIL per test case, followed by a summary table:

```
  POST /users (12 cases)
    PASS POST /users — missing 'name'
    PASS POST /users — 'name' wrong type (number)
    FAIL POST /users — empty body {} — Expected status 400|422, got 200

══════════════════════════════════════
  Test Results Summary
══════════════════════════════════════

 Category │ Total │ Passed │ Failed
──────────┼───────┼────────┼───────
 body     │ 8     │ 7      │ 1
 auth     │ 4     │ 4      │ 0

  Total: 12 | Passed: 11 | Failed: 1 | Rate: 91.7%
```

## Updating Tests

When your API changes (new fields, different responses), re-record and regenerate:

```bash
npx api-test update
```

This reads the existing `config.json`, re-records all happy cases, and regenerates all test suites. The config itself (host, auth, endpoints) is preserved.

## Adding Endpoints

To add new endpoints to an existing configuration without re-entering everything:

```bash
npx api-test add
```

This loads the existing config, opens the wizard with pre-filled values, and lets you add more endpoints. The existing endpoints are preserved.

## Custom Test Cases

Generated test files are standard JSON. You can:

1. **Edit generated files** -- add or modify test cases in `generated/*.test.json`. Note that `update` will overwrite these files.

2. **Create manual test files** -- add your own `.test.json` files in the `generated/` directory following the `TestSuite` schema. The runner loads all `*.test.json` files from that directory.

A custom test case follows this structure:

```json
{
  "id": "custom_1",
  "name": "POST /users — duplicate email",
  "category": "body",
  "description": "Send a request with an already-registered email",
  "request": {
    "method": "POST",
    "url": "http://localhost:3000/users",
    "headers": { "Content-Type": "application/json", "Authorization": "Bearer ..." },
    "body": { "name": "Jane", "email": "existing@example.com" }
  },
  "expect": {
    "status": [409],
    "bodyContains": ["already exists"]
  },
  "mutation": "Used duplicate email address"
}
```

### Expect Options

| Field             | Type                | Description                                    |
| ----------------- | ------------------- | ---------------------------------------------- |
| `status`          | `number \| number[]` | Expected HTTP status code(s)                   |
| `bodyContains`    | `string[]`          | Strings that must appear in the response body  |
| `bodyNotContains` | `string[]`          | Strings that must NOT appear (e.g., SQL errors, raw XSS) |
| `headerPresent`   | `string[]`          | Response headers that must exist               |

## CI Integration

Add to your CI pipeline to catch regressions:

```yaml
# GitHub Actions example
- name: Start server
  run: npm start &
  env:
    NODE_ENV: test

- name: Wait for server
  run: npx wait-on http://localhost:3000/health

- name: Run API mutation tests
  run: npx api-test run --bail --report html

- name: Upload report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: api-test-report
    path: api-tests/reports/*.html
```

The `run` command exits with code 1 when any test fails, so CI pipelines will detect failures automatically via `--bail`.

## Config File Reference

The `config.json` file (`ApiTestConfig`) has the following structure:

```json
{
  "host": "http://localhost:3000",
  "basePath": "/api/v1",
  "auth": {
    "type": "bearer",
    "token": "eyJhbGciOiJI..."
  },
  "headers": {
    "X-Tenant-Id": "acme"
  },
  "endpoints": [
    {
      "method": "GET",
      "path": "/users/:id",
      "description": "Get user by ID",
      "params": { "id": "123" },
      "query": { "include": "profile" },
      "headers": { "X-Custom": "value" }
    },
    {
      "method": "POST",
      "path": "/users",
      "body": { "name": "John", "email": "john@example.com" }
    }
  ],
  "outputDir": "./api-tests",
  "categories": ["auth", "body", "params", "headers", "edge", "method"]
}
```

### Auth Types

| Type     | Required Fields              |
| -------- | ---------------------------- |
| `bearer` | `token`                      |
| `api-key` | `headerName`, `token`       |
| `cookie` | `cookieName`, `cookieValue`  |
| `basic`  | `username`, `password`       |
| `none`   | (none)                       |

### Endpoint Fields

| Field         | Type                          | Required | Description                    |
| ------------- | ----------------------------- | -------- | ------------------------------ |
| `method`      | `GET\|POST\|PUT\|PATCH\|DELETE` | Yes      | HTTP method                    |
| `path`        | `string`                      | Yes      | URL path (supports `:param`)   |
| `description` | `string`                      | No       | Human-readable label           |
| `params`      | `Record<string, string>`      | No       | Values for `:param` segments   |
| `query`       | `Record<string, string>`      | No       | Query string parameters        |
| `body`        | `any`                         | No       | Request body (JSON)            |
| `headers`     | `Record<string, string>`      | No       | Per-endpoint headers           |
| `cookies`     | `Record<string, string>`      | No       | Per-endpoint cookies           |

### Body Payload Analysis

The CLI automatically analyzes your request body to detect field types and patterns:

| Detected Pattern | Example Value                          |
| ---------------- | -------------------------------------- |
| `email`          | `user@example.com`                     |
| `url`            | `https://example.com`                  |
| `uuid`           | `550e8400-e29b-41d4-a716-446655440000` |
| `iso-date`       | `2026-01-15T10:30:00`                  |

These patterns inform the generated edge-case mutations for more targeted testing.
