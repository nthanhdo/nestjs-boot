# API Testing CLI

## Gioi thieu

`@nestjs-boot/api-test` la mot CLI tuong tac, ghi lai response thuc te tu API (happy case) va tu dong sinh ra cac bo mutation test. CLI gui HTTP request that den server, luu lai response lam baseline, sau do tao hang chuc test case bang cach thay doi co he thong cac thanh phan: authentication, request body, URL parameter, header, HTTP method va cac truong hop edge-case.

Cac test duoc luu duoi dang JSON, khong phu thuoc framework, chay duoc bat cu dau co Node.js 18+.

**Tinh nang chinh:**

- Wizard tuong tac de cau hinh host, auth, header va endpoint
- Ghi lai response baseline (happy-case) tu server dang chay
- Tu dong sinh mutation test theo 6 category
- Chay test voi bao cao console, JSON va HTML
- Ghi lai va sinh lai test khi API thay doi
- Khong co runtime dependency bat buoc (tuy chon `@clack/prompts` va `picocolors` de UI dep hon)

## Cai dat

```bash
npm install @nestjs-boot/api-test
```

Hoac lam dev dependency:

```bash
npm install -D @nestjs-boot/api-test
```

Yeu cau **Node.js >= 18.0.0** (su dung native `fetch` va `AbortSignal.timeout`).

## Bat dau nhanh

1. Khoi dong API server.
2. Chay wizard:

```bash
npx api-test generate
```

3. Tra loi cac cau hoi tuong tac (host, auth, endpoint, mutation category).
4. CLI ghi lai happy-case response va sinh test suite.
5. Chay test:

```bash
npx api-test run
```

## Danh sach lenh

| Lenh       | Mo ta                                                      |
| ---------- | ---------------------------------------------------------- |
| `generate` | Wizard tuong tac de cau hinh va sinh test (mac dinh)       |
| `run`      | Chay cac test suite da sinh len server dang chay           |
| `update`   | Ghi lai happy case va sinh lai tat ca test                 |
| `add`      | Them endpoint moi vao cau hinh hien tai                    |
| `help`     | Hien thi huong dan CLI                                     |

### Tuy chon chung

| Tuy chon           | Mo ta                                                |
| ------------------ | ---------------------------------------------------- |
| `--config <path>`  | Duong dan den file config (mac dinh: `./api-tests/config.json`) |
| `--report html`    | Sinh bao cao HTML (dung voi `run`)                   |
| `--filter <cat>`   | Loc test theo category: `auth\|body\|params\|headers\|edge\|method` |
| `--bail`           | Dung lai khi gap test that bai dau tien              |

## Cac buoc trong Wizard

Khi chay `npx api-test generate`, wizard di qua cac buoc sau:

### 1. Base URL

```
Base URL? (http://localhost:3000)
```

URL goc cua API server dang chay.

### 2. Base Path

```
Base path? (optional, e.g. /api/v1)
```

Prefix duoc them truoc tat ca endpoint path. De trong neu route bat dau tu root.

### 3. Authentication

```
Authentication method?
  1) Bearer Token
  2) API Key
  3) Cookie
  4) Basic Auth
  5) None
```

Tuy theo lua chon, wizard se hoi them thong tin xac thuc tuong ung (token, ten header, cookie name/value, hoac username/password). Thong tin nay duoc dung cho tat ca request va la co so de sinh auth mutation test.

### 4. Global Header

```
Add global headers? (y/n)
```

Them header tuy chinh gui kem moi request (vi du: `X-Tenant-Id`, `Accept-Language`).

### 5. Endpoint

Voi moi endpoint, wizard hoi:

- **HTTP Method** (GET, POST, PUT, PATCH, DELETE)
- **Path** (vi du: `/users/:id`) -- tu dong nhan dien path param tu cu phap `:param`
- **Description** (tuy chon)
- **Gia tri path param** (hoi cho tung `:param` phat hien duoc)
- **Request body** (JSON, cho POST/PUT/PATCH)
- **Query param** (`key=value&key2=value2`)
- **Header rieng** (`key:value, key2:value2`)

Ban co the them nhieu endpoint tuy y.

### 6. Mutation Category

```
Which mutation categories?
  1) Auth (token/key removal, invalid)
  2) Body (missing fields, wrong types)
  3) Params (invalid, missing, special chars)
  4) Headers (content-type, accept)
  5) Edge (XSS, SQL injection, long strings)
  6) Method (wrong HTTP method)
```

Chon loai mutation test can sinh. Mac dinh chon tat ca.

### 7. Thu muc Output

```
Output directory? (./api-tests)
```

Noi luu recording, test da sinh, config va bao cao.

### 8. Xac nhan

Wizard hien thi tom tat va hoi xac nhan truoc khi bat dau ghi.

## Cac Mutation Category

### Auth

Test kiem tra viec thuc thi authentication. Chi sinh khi co cau hinh auth.

| Test Case               | Lam gi                                  | Expected Status |
| ----------------------- | --------------------------------------- | --------------- |
| No auth                 | Xoa hoan toan auth header/cookie        | 401 hoac 403    |
| Invalid credentials     | Gui token/key/cookie gia                | 401 hoac 403    |
| Empty auth value        | Gui token rong                          | 401 hoac 403    |
| Malformed JWT           | Gui chuoi khong phai JWT (chi bearer)   | 401 hoac 403    |

### Body

Test kiem tra validation cua request body. Chi sinh cho POST/PUT/PATCH co JSON body.

| Test Case          | Lam gi                               | Expected Status |
| ------------------ | ------------------------------------ | --------------- |
| Missing field      | Xoa tung field cap cao nhat          | 400 hoac 422    |
| Wrong type         | Gui number thay vi string (va nguoc lai) | 400 hoac 422 |
| Null value         | Dat tung field thanh `null`          | 400 hoac 422    |
| Empty body `{}`    | Gui object rong                      | 400 hoac 422    |
| No body            | Xoa body va Content-Type             | 400 hoac 422    |
| Array body         | Boc object trong mang                | 400 hoac 422    |
| Extra unknown field | Them field `__unknown_field_xyz`     | 200, 201, 400, hoac 422 |

### Params

Test kiem tra validation cua URL parameter. Chi sinh cho endpoint co `:param`.

| Test Case        | Lam gi                                        | Expected Status |
| ---------------- | --------------------------------------------- | --------------- |
| Invalid format   | Gui `abc-not-valid` cho param dang so/ObjectId/UUID | 400, 404, hoac 422 |
| Non-existent     | Gui `999999999` hoac ObjectId bang 0           | 404             |
| Empty            | Gui chuoi rong                                 | 400, 404, hoac 405 |
| Special chars    | Gui `<script>alert(1)</script>`                | 400, 404, hoac 422 |

Generator tu dong nhan dien kieu param (numeric, MongoDB ObjectId, UUID) va tao test phu hop.

### Headers

Test kiem tra xu ly Content-Type va Accept header.

| Test Case           | Lam gi                               | Expected Status |
| ------------------- | ------------------------------------ | --------------- |
| No Content-Type     | Xoa Content-Type tu request co body  | 400, 415, hoac 422 |
| Wrong Content-Type  | Gui `text/plain` thay vi `application/json` | 400, 415, hoac 422 |
| No Accept           | Xoa Accept header (van phai hoat dong) | 200, 201, hoac 204 |

### Edge

Test bao mat va dieu kien bien cho cac field string va number.

| Test Case        | Lam gi                              | Expected Status | Kiem tra them |
| ---------------- | ----------------------------------- | --------------- | ------------- |
| Empty string     | Dat field thanh `""`                | 400, 422, 200, 201 | -- |
| Very long string | Dat field thanh 10.000 ky tu        | 400, 413, hoac 422 | -- |
| XSS payload      | Dat field thanh `<script>alert(1)</script>` | 200, 201, 400, 422 | Body KHONG duoc chua script tag |
| SQL injection    | Dat field thanh `' OR 1=1 --`       | 200, 201, 400, 422 | Body KHONG duoc chua tu khoa SQL error |
| Null character   | Dat field thanh `\u0000`            | 200, 201, 400, 422 | -- |
| Zero             | Dat numeric field thanh `0`         | 200, 201, 400, 422 | -- |
| Negative         | Dat numeric field thanh `-1`        | 200, 201, 400, 422 | -- |
| MAX_SAFE_INTEGER | Dat numeric field thanh `9007199254740991` | 200, 201, 400, 422 | -- |
| Float            | Dat numeric field thanh `1.5`       | 200, 201, 400, 422 | -- |

### Method

Test kiem tra server tu choi HTTP method sai.

| Test Case     | Lam gi                                    | Expected Status |
| ------------- | ----------------------------------------- | --------------- |
| Wrong method  | Gui tat ca HTTP method khac (4 cho moi endpoint) | 405, 404, 400, hoac 301 |

## Cau truc Output

Sau khi `generate`, thu muc output chua:

```
api-tests/
  config.json              # Cau hinh day du (host, auth, endpoint, category)
  recordings/
    GET_users.json         # Happy-case response da ghi cho moi endpoint
    POST_users.json
  generated/
    GET_users.test.json    # Test suite da sinh cho moi endpoint
    POST_users.test.json
```

Ten file duoc tao tu HTTP method va path (vi du: `POST_users_id` cho `POST /users/:id`).

Moi file `.test.json` chua mot object `TestSuite`:

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

## Chay Test

Chay tat ca test da sinh len server dang chay:

```bash
npx api-test run
```

### Loc theo Category

```bash
npx api-test run --filter auth
npx api-test run --filter edge
```

### Dung khi gap loi dau tien

```bash
npx api-test run --bail
```

### Sinh bao cao

Bao cao JSON luon duoc luu vao `api-tests/reports/`. De co bao cao HTML:

```bash
npx api-test run --report html
```

### Su dung config tuy chinh

```bash
npx api-test run --config ./path/to/config.json
```

### Ket qua console

Runner in ket qua theo tung endpoint voi PASS/FAIL cho moi test case, tiep theo la bang tom tat:

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

## Cap nhat Test

Khi API thay doi (them field moi, response khac), ghi lai va sinh lai:

```bash
npx api-test update
```

Lenh nay doc `config.json` hien tai, ghi lai tat ca happy case va sinh lai tat ca test suite. Cau hinh (host, auth, endpoint) duoc giu nguyen.

## Them Endpoint

De them endpoint moi vao cau hinh hien tai ma khong can nhap lai tu dau:

```bash
npx api-test add
```

Lenh nay tai cau hinh hien co, mo wizard voi gia tri da dien san, va cho phep them endpoint moi. Cac endpoint cu duoc giu nguyen.

## Test Case Tu Viet

File test da sinh la JSON tieu chuan. Ban co the:

1. **Sua file da sinh** -- them hoac chinh test case trong `generated/*.test.json`. Luu y rang `update` se ghi de cac file nay.

2. **Tao file test thu cong** -- them file `.test.json` rieng vao thu muc `generated/` theo schema `TestSuite`. Runner tai tat ca file `*.test.json` trong thu muc do.

Cau truc mot test case tu viet:

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

### Cac tuy chon Expect

| Field             | Kieu                  | Mo ta                                          |
| ----------------- | --------------------- | ---------------------------------------------- |
| `status`          | `number \| number[]`  | HTTP status code mong doi                      |
| `bodyContains`    | `string[]`            | Chuoi phai co trong response body              |
| `bodyNotContains` | `string[]`            | Chuoi KHONG duoc co (vi du: SQL error, raw XSS) |
| `headerPresent`   | `string[]`            | Response header phai ton tai                   |

## Tich hop CI

Them vao CI pipeline de phat hien regression:

```yaml
# Vi du GitHub Actions
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

Lenh `run` thoat voi exit code 1 khi co test that bai, nen CI pipeline se tu dong phat hien loi qua `--bail`.

## Tham chieu Config File

File `config.json` (`ApiTestConfig`) co cau truc nhu sau:

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

### Cac kieu Auth

| Kieu     | Cac field bat buoc            |
| -------- | ----------------------------- |
| `bearer` | `token`                       |
| `api-key` | `headerName`, `token`        |
| `cookie` | `cookieName`, `cookieValue`   |
| `basic`  | `username`, `password`        |
| `none`   | (khong co)                    |

### Cac field cua Endpoint

| Field         | Kieu                          | Bat buoc | Mo ta                          |
| ------------- | ----------------------------- | -------- | ------------------------------ |
| `method`      | `GET\|POST\|PUT\|PATCH\|DELETE` | Co       | HTTP method                    |
| `path`        | `string`                      | Co       | URL path (ho tro `:param`)     |
| `description` | `string`                      | Khong    | Nhan mo ta                     |
| `params`      | `Record<string, string>`      | Khong    | Gia tri cho cac doan `:param`  |
| `query`       | `Record<string, string>`      | Khong    | Query string parameter         |
| `body`        | `any`                         | Khong    | Request body (JSON)            |
| `headers`     | `Record<string, string>`      | Khong    | Header rieng cho endpoint      |
| `cookies`     | `Record<string, string>`      | Khong    | Cookie rieng cho endpoint      |

### Phan tich Body Payload

CLI tu dong phan tich request body de nhan dien kieu field va pattern:

| Pattern duoc nhan dien | Vi du gia tri                          |
| ---------------------- | -------------------------------------- |
| `email`                | `user@example.com`                     |
| `url`                  | `https://example.com`                  |
| `uuid`                 | `550e8400-e29b-41d4-a716-446655440000` |
| `iso-date`             | `2026-01-15T10:30:00`                  |

Cac pattern nay giup sinh edge-case mutation chinh xac hon.
