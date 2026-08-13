# Hướng dẫn Testing — nestjs-boot

> Tham chiếu đầy đủ cho các tiện ích testing trong nestjs-boot.

## Cài đặt

```bash
npm install --save-dev vitest mongodb-memory-server supertest
```

Tất cả tiện ích import từ `nestjs-boot/testing`.

---

## 1. createTestApp — Khởi tạo ứng dụng In-Memory

Tạo ứng dụng NestJS với MongoDB in-memory (qua `mongodb-memory-server`) và không có cache/health/logging mặc định.

```ts
import { createTestApp } from 'nestjs-boot/testing';
import type { TestAppContext } from 'nestjs-boot/testing';

let ctx: TestAppContext;

beforeAll(async () => {
  ctx = await createTestApp(AppModule, {
    autoClean: true,                    // bật beforeEachClean()
    response: { envelope: true },       // ghi đè BootOptions bất kỳ
    overrideProviders: [                // mock provider cụ thể
      { provide: EmailService, useValue: { send: vi.fn() } },
    ],
  });
});

beforeEach(() => ctx.beforeEachClean());  // xóa tất cả collection
afterAll(() => ctx.cleanup());            // dừng memory server + đóng app
```

**Các field của TestAppContext:**

| Field | Kiểu | Mô tả |
|-------|------|-------------|
| `app` | `INestApplication` | Instance ứng dụng NestJS |
| `module` | `TestingModule` | Module testing gốc |
| `mongoUri` | `string` | URI kết nối MongoDB in-memory |
| `mongoConnection` | `Connection \| undefined` | Handle kết nối Mongoose |
| `cleanup()` | `Promise<void>` | Dừng server + đóng app (gọi trong `afterAll`) |
| `beforeEachClean()` | `Promise<void>` | Xóa tất cả collection (yêu cầu `autoClean: true`) |

---

## 2. createTestSuite — Cách ly test tất-cả-trong-một

Gói `createTestApp` + `createTestClient` + `createFactory` vào một đối tượng duy nhất với các phương thức vòng đời.

```ts
import { createTestSuite } from 'nestjs-boot/testing';

const suite = createTestSuite(AppModule, {
  response: { envelope: true },
});

beforeAll(() => suite.setup());
afterAll(() => suite.teardown());
beforeEach(() => suite.reset());  // dọn DB mỗi test

it('creates and lists products', async () => {
  const factory = suite.factory('Product', ProductSchema, {
    name: (seq) => `Product ${seq}`,
    price: () => Math.random() * 100,
  });
  await factory.createMany(5, suite.connection!);

  const res = await suite.client.get('/products');
  expect(res.data).toHaveLength(5);
});

it('starts clean (isolation verified)', async () => {
  const res = await suite.client.get('/products');
  expect(res.data).toHaveLength(0);
});
```

**API TestSuite:** `setup()`, `teardown()`, `reset()`, `app`, `module`, `client`, `connection`, `inject(token)`, `factory(name, schema, defaults)`.

---

## 3. createTestClient — HTTP Assertion linh hoạt

HTTP client nhận biết envelope xây dựng trên supertest. Tự động unwrap response `{ success, data, meta }`.

```ts
import { createTestClient } from 'nestjs-boot/testing';
import type { TestClient, TestResponse } from 'nestjs-boot/testing';

const client = createTestClient(ctx.app);

// Đặt auth cho tất cả request tiếp theo
client.setBearerToken(token);

const res: TestResponse = await client.get('/products');
// res.status  — HTTP status code
// res.data    — dữ liệu đã unwrap (từ envelope hoặc body thô)
// res.raw     — body response đầy đủ trước khi unwrap
// res.headers — response header

await client.post('/products', { name: 'Widget' });
await client.put('/products/123', { name: 'Updated' });
await client.patch('/products/123', { stock: 10 });
await client.delete('/products/123');
```

Mỗi phương thức chấp nhận tham số `headers` tùy chọn ở cuối.

---

## 4. createGrpcTestClient — Testing gRPC trong process

Gọi handler `@GrpcMethod` trực tiếp qua DI mà không cần khởi động gRPC server thật.

```ts
import { createGrpcTestClient } from 'nestjs-boot/testing';

const client = createGrpcTestClient(app, 'OrderService');
// Hoặc với DI token tùy chỉnh:
// createGrpcTestClient(app, 'OrderService', OrderServiceToken);

const order = await client.call('FindOne', { id: '123' });
expect(order.status).toBe('shipped');

// Khám phá các phương thức có sẵn
const methods = client.listMethods(); // ['FindOne', 'FindAll', 'Create', ...]
```

Ném lỗi mô tả rõ ràng khi service hoặc phương thức không thể phân giải.

---

## 5. createMessageDispatcher — Testing Microservice Pattern

Gọi handler `@MessagePattern` và `@EventPattern` trong process mà không cần message broker thật. Quét tất cả controller và provider trong DI container.

```ts
import { createMessageDispatcher } from 'nestjs-boot/testing';

const dispatcher = createMessageDispatcher(app);

// Request-reply (@MessagePattern)
const result = await dispatcher.send('order.create', { userId: '123' });
expect(result.orderId).toBeDefined();

// Fire-and-forget (@EventPattern)
await dispatcher.emit('order.created', { orderId: '456' });
// Xác minh tác động phụ trong DB
```

Ném lỗi nếu không có handler nào được đăng ký cho pattern đó, liệt kê tất cả pattern đã đăng ký trong thông báo lỗi.

---

## 6. ContractVerifier — Xác thực Service Contract

Xác minh rằng service implement tất cả phương thức được định nghĩa trong contract. Hỗ trợ schema Zod và Joi.

```ts
import { ContractVerifier } from 'nestjs-boot/testing';
import { z } from 'zod';

const contract = {
  methods: [
    {
      name: 'findAll',
      input: z.object({}).optional(),
      output: z.object({ data: z.array(z.any()), total: z.number() }),
    },
    {
      name: 'findById',
      input: z.string(),
      output: z.object({ name: z.string() }).nullable(),
    },
  ],
};

// Cấp 1: kiểm tra cấp class (sự tồn tại phương thức trên prototype)
const result = ContractVerifier.verify(ProductService, contract);
expect(result.pass).toBe(true);
expect(result.violations).toEqual([]);

// Cấp 2: kiểm tra cấp instance (thực sự gọi phương thức với dữ liệu test)
const instanceResult = await ContractVerifier.verifyInstance(productService, {
  methods: [
    { name: 'findById', testInput: '507f1f77bcf86cd799439011', output: productSchema },
  ],
});
```

---

## 7. createFactory — Factory dữ liệu test

Factory nhận biết schema với chuỗi tự tăng, trait có tên, và lưu trữ vào database.

```ts
import { createFactory } from 'nestjs-boot/testing';

const productFactory = createFactory('Product', ProductSchema, {
  name: (seq) => `Product-${seq}`,   // generator với số thứ tự
  price: () => 10,                    // generator không có số thứ tự
  category: 'electronics',            // giá trị tĩnh
  stock: 50,
}, {
  traits: {
    expensive: { price: () => 500 + Math.random() * 500 },
    outOfStock: { stock: 0 },
    digital: { category: 'digital', stock: Infinity },
  },
  afterCreate: async (doc, connection) => {
    // Hook sau tạo (audit log, bộ đếm, v.v.)
  },
});

// Tạo đối tượng thuần (không ghi DB)
const item = productFactory.build();                         // mặc định
const expensive = productFactory.build('expensive');          // với trait
const custom = productFactory.build({ category: 'toys' });   // với ghi đè
const items = productFactory.buildMany(10);                  // hàng loạt

// Lưu vào database
const saved = await productFactory.create(connection);
const batch = await productFactory.createMany(25, connection);
const traitBatch = await productFactory.createMany(5, connection, 'outOfStock');

// Reset bộ đếm số thứ tự
productFactory.resetSequence();
```

---

## 8. Tiện ích Testing Auth

### createTestJwt

Tạo JWT hợp lệ với secret test mặc định.

```ts
import { createTestJwt, TEST_SECRET } from 'nestjs-boot/testing';

const token = createTestJwt(
  { sub: 'user-1', roles: ['admin'], email: 'test@example.com' },
  { expiresIn: '1h', algorithm: 'HS256' },  // tùy chọn
);
client.setBearerToken(token);
```

Secret mặc định là `'nestjs-boot-test-secret-do-not-use-in-prod'`, export dưới tên `TEST_SECRET`.

### createTestApiKey

Tạo chuỗi API key xác định dựa trên quyền.

```ts
import { createTestApiKey } from 'nestjs-boot/testing';

const key = createTestApiKey(['read', 'write']);  // 'test-api-key-cmVhZCx3cml0'
const defaultKey = createTestApiKey();             // 'test-api-key-default'
```

### createAuthenticatedRequest

Tạo đối tượng request mock để unit-test guard và service.

```ts
import { createAuthenticatedRequest } from 'nestjs-boot/testing';

const req = createAuthenticatedRequest({ sub: 'user-1', roles: ['admin'] });
// { headers: { authorization: 'Bearer eyJ...' } }
```

### MockAuthModule

Bỏ qua tất cả auth guard trong e2e test khi auth không phải trọng tâm.

```ts
import { MockAuthModule } from 'nestjs-boot/testing';

const ctx = await createTestApp(AppModule, {
  overrideProviders: [MockAuthModule.register({ sub: 'test-user' })],
});
// Tất cả auth guard được thỏa mãn với mock user
```

`MockAuthModule.register()` chấp nhận đối tượng mock user tùy chọn (mặc định: `{ sub: 'test-user-id', email: 'test@example.com' }`). Nó cung cấp JWT secret test toàn cục.

---

## 9. Snapshot Testing

### expectSnapshot

Loại bỏ các field biến động trước khi chạy `toMatchSnapshot()` của vitest.

```ts
import { expectSnapshot } from 'nestjs-boot/testing';

const res = await client.get('/products/123');
expectSnapshot(res.data, {
  ignore: ['_id', 'createdAt', 'updatedAt'],  // mặc định: _id, id, createdAt, updatedAt, __v
  name: 'product detail',                      // tên snapshot tùy chọn
});
```

### stripVolatileFields

Loại bỏ field mà không chạy assertion. Hữu ích cho so sánh tùy chỉnh.

```ts
import { stripVolatileFields } from 'nestjs-boot/testing';

const cleaned = stripVolatileFields(data);                    // loại bỏ mặc định
const custom = stripVolatileFields(data, ['_id', 'secret']); // field tùy chỉnh
expect(cleaned).toEqual({ name: 'Widget', price: 9.99 });
```

Cả hai hàm đệ quy vào đối tượng và mảng lồng nhau.

---

## 10. seedDatabase / cleanDatabase

Helper database cấp thấp khi bạn cần điều khiển trực tiếp.

```ts
import { seedDatabase, cleanDatabase } from 'nestjs-boot/testing';

// Seed: trả về map tên collection tới mảng _id đã chèn
const ids = await seedDatabase(connection, {
  users: [{ name: 'Alice' }, { name: 'Bob' }],
  products: [{ title: 'Widget', price: 9.99 }],
});
// ids.users = ['64a...', '64b...']
// ids.products = ['64c...']

// Clean: xóa tất cả collection
await cleanDatabase(connection);
```

---

## Tham chiếu nhanh

| Tiện ích | Mục đích |
|---------|---------|
| `createTestApp` | Ứng dụng in-memory với MongoDB, mock cache, tự dọn dẹp |
| `createTestSuite` | Suite tất-cả-trong-một với vòng đời + client + factory |
| `createTestClient` | HTTP client nhận biết envelope (supertest) |
| `createGrpcTestClient` | Testing handler gRPC trong process |
| `createMessageDispatcher` | Dispatcher MessagePattern/EventPattern |
| `ContractVerifier` | Xác minh service contract (cấp class hoặc instance) |
| `createFactory` | Factory nhận biết schema với trait + chuỗi |
| `createTestJwt` | Tạo JWT test với secret mặc định |
| `createTestApiKey` | Tạo API key xác định |
| `createAuthenticatedRequest` | Request mock với Bearer token |
| `MockAuthModule` | Bỏ qua auth guard toàn cục trong test |
| `expectSnapshot` | Snapshot testing nhận biết field biến động |
| `stripVolatileFields` | Loại bỏ ID/timestamp để so sánh |
| `seedDatabase` | Chèn hàng loạt dữ liệu fixture |
| `cleanDatabase` | Xóa tất cả collection |
| `createMockGrpcService` | Mock đối tượng gRPC service từ response factory |
