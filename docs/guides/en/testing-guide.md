# Testing Guide — nestjs-boot

> **TL;DR** — `createTestApp` gives you an in-memory MongoDB app. `createTestSuite` wraps everything (app + client + factory) with lifecycle methods. `createTestClient` is an envelope-aware HTTP client. `createTestJwt` and `MockAuthModule` handle auth in tests. All utilities import from `nestjs-boot/testing`.

## Setup

```bash
npm install --save-dev vitest mongodb-memory-server supertest
```

All utilities import from `nestjs-boot/testing`.

---

## 1. createTestApp — In-Memory App Bootstrap

Creates a NestJS app with in-memory MongoDB (via `mongodb-memory-server`) and no cache/health/logging by default.

```ts
import { createTestApp } from 'nestjs-boot/testing';
import type { TestAppContext } from 'nestjs-boot/testing';

let ctx: TestAppContext;

beforeAll(async () => {
  ctx = await createTestApp(AppModule, {
    autoClean: true,                    // enables beforeEachClean()
    response: { envelope: true },       // any BootOptions override
    overrideProviders: [                // mock specific providers
      { provide: EmailService, useValue: { send: vi.fn() } },
    ],
  });
});

beforeEach(() => ctx.beforeEachClean());  // drops all collections
afterAll(() => ctx.cleanup());            // stops memory server + closes app
```

**TestAppContext fields:**

| Field | Type | Description |
|-------|------|-------------|
| `app` | `INestApplication` | The NestJS app instance |
| `module` | `TestingModule` | The root testing module |
| `mongoUri` | `string` | In-memory MongoDB connection URI |
| `mongoConnection` | `Connection \| undefined` | Mongoose connection handle |
| `cleanup()` | `Promise<void>` | Stop server + close app (call in `afterAll`) |
| `beforeEachClean()` | `Promise<void>` | Drop all collections (requires `autoClean: true`) |

---

## 2. createTestSuite — All-in-One Test Isolation

Wraps `createTestApp` + `createTestClient` + `createFactory` into a single object with lifecycle methods.

```ts
import { createTestSuite } from 'nestjs-boot/testing';

const suite = createTestSuite(AppModule, {
  response: { envelope: true },
});

beforeAll(() => suite.setup());
afterAll(() => suite.teardown());
beforeEach(() => suite.reset());  // cleans DB each test

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

**TestSuite API:** `setup()`, `teardown()`, `reset()`, `app`, `module`, `client`, `connection`, `inject(token)`, `factory(name, schema, defaults)`.

---

## 3. createTestClient — Fluent HTTP Assertions

Envelope-aware HTTP client built on supertest. Auto-unwraps `{ success, data, meta }` responses.

```ts
import { createTestClient } from 'nestjs-boot/testing';
import type { TestClient, TestResponse } from 'nestjs-boot/testing';

const client = createTestClient(ctx.app);

// Set auth for all subsequent requests
client.setBearerToken(token);

const res: TestResponse = await client.get('/products');
// res.status  — HTTP status code
// res.data    — unwrapped data (from envelope or raw body)
// res.raw     — full response body before unwrap
// res.headers — response headers

await client.post('/products', { name: 'Widget' });
await client.put('/products/123', { name: 'Updated' });
await client.patch('/products/123', { stock: 10 });
await client.delete('/products/123');
```

Every method accepts an optional `headers` parameter as the last argument.

---

## 4. createGrpcTestClient — In-Process gRPC Testing

Calls `@GrpcMethod` handlers directly through DI without starting a real gRPC server.

```ts
import { createGrpcTestClient } from 'nestjs-boot/testing';

const client = createGrpcTestClient(app, 'OrderService');
// Or with custom DI token:
// createGrpcTestClient(app, 'OrderService', OrderServiceToken);

const order = await client.call('FindOne', { id: '123' });
expect(order.status).toBe('shipped');

// Discover available methods
const methods = client.listMethods(); // ['FindOne', 'FindAll', 'Create', ...]
```

Throws descriptive errors when a service or method cannot be resolved.

---

## 5. createMessageDispatcher — Microservice Pattern Testing

Invokes `@MessagePattern` and `@EventPattern` handlers in-process without a real message broker. Scans all controllers and providers in the DI container.

```ts
import { createMessageDispatcher } from 'nestjs-boot/testing';

const dispatcher = createMessageDispatcher(app);

// Request-reply (@MessagePattern)
const result = await dispatcher.send('order.create', { userId: '123' });
expect(result.orderId).toBeDefined();

// Fire-and-forget (@EventPattern)
await dispatcher.emit('order.created', { orderId: '456' });
// Verify side effects in DB
```

Throws if no handler is registered for the given pattern, listing all registered patterns in the error message.

---

## 6. ContractVerifier — Service Contract Validation

Verifies that a service implements all methods defined in a contract. Supports Zod and Joi schemas.

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

// Level 1: class-level check (method existence on prototype)
const result = ContractVerifier.verify(ProductService, contract);
expect(result.pass).toBe(true);
expect(result.violations).toEqual([]);

// Level 2: instance-level check (actually calls methods with test data)
const instanceResult = await ContractVerifier.verifyInstance(productService, {
  methods: [
    { name: 'findById', testInput: '507f1f77bcf86cd799439011', output: productSchema },
  ],
});
```

---

## 7. createFactory — Test Data Factories

Schema-aware factories with auto-incrementing sequences, named traits, and database persistence.

```ts
import { createFactory } from 'nestjs-boot/testing';

const productFactory = createFactory('Product', ProductSchema, {
  name: (seq) => `Product-${seq}`,   // generator with sequence number
  price: () => 10,                    // generator without sequence
  category: 'electronics',            // static value
  stock: 50,
}, {
  traits: {
    expensive: { price: () => 500 + Math.random() * 500 },
    outOfStock: { stock: 0 },
    digital: { category: 'digital', stock: Infinity },
  },
  afterCreate: async (doc, connection) => {
    // Post-creation hook (audit log, counters, etc.)
  },
});

// Build plain objects (no DB write)
const item = productFactory.build();                         // defaults
const expensive = productFactory.build('expensive');          // with trait
const custom = productFactory.build({ category: 'toys' });   // with overrides
const items = productFactory.buildMany(10);                  // batch

// Persist to database
const saved = await productFactory.create(connection);
const batch = await productFactory.createMany(25, connection);
const traitBatch = await productFactory.createMany(5, connection, 'outOfStock');

// Reset sequence counter
productFactory.resetSequence();
```

---

## 8. Auth Testing Utilities

### createTestJwt

Generate valid JWTs with a default test secret.

```ts
import { createTestJwt, TEST_SECRET } from 'nestjs-boot/testing';

const token = createTestJwt(
  { sub: 'user-1', roles: ['admin'], email: 'test@example.com' },
  { expiresIn: '1h', algorithm: 'HS256' },  // optional
);
client.setBearerToken(token);
```

The default secret is `'nestjs-boot-test-secret-do-not-use-in-prod'`, exported as `TEST_SECRET`.

### createTestApiKey

Generate deterministic API key strings based on permissions.

```ts
import { createTestApiKey } from 'nestjs-boot/testing';

const key = createTestApiKey(['read', 'write']);  // 'test-api-key-cmVhZCx3cml0'
const defaultKey = createTestApiKey();             // 'test-api-key-default'
```

### createAuthenticatedRequest

Build a mock request object for unit-testing guards and services.

```ts
import { createAuthenticatedRequest } from 'nestjs-boot/testing';

const req = createAuthenticatedRequest({ sub: 'user-1', roles: ['admin'] });
// { headers: { authorization: 'Bearer eyJ...' } }
```

### MockAuthModule

Bypass all auth guards in e2e tests where auth is not the focus.

```ts
import { MockAuthModule } from 'nestjs-boot/testing';

const ctx = await createTestApp(AppModule, {
  overrideProviders: [MockAuthModule.register({ sub: 'test-user' })],
});
// All auth guards are satisfied with the mock user
```

`MockAuthModule.register()` accepts an optional mock user object (defaults to `{ sub: 'test-user-id', email: 'test@example.com' }`). It provides a test JWT secret globally.

---

## 9. Snapshot Testing

### expectSnapshot

Strips volatile fields before running vitest's `toMatchSnapshot()`.

```ts
import { expectSnapshot } from 'nestjs-boot/testing';

const res = await client.get('/products/123');
expectSnapshot(res.data, {
  ignore: ['_id', 'createdAt', 'updatedAt'],  // default: _id, id, createdAt, updatedAt, __v
  name: 'product detail',                      // optional snapshot name
});
```

### stripVolatileFields

Strip fields without running an assertion. Useful for custom comparisons.

```ts
import { stripVolatileFields } from 'nestjs-boot/testing';

const cleaned = stripVolatileFields(data);                    // strips defaults
const custom = stripVolatileFields(data, ['_id', 'secret']); // custom fields
expect(cleaned).toEqual({ name: 'Widget', price: 9.99 });
```

Both functions recurse into nested objects and arrays.

---

## 10. seedDatabase / cleanDatabase

Low-level database helpers for when you need direct control.

```ts
import { seedDatabase, cleanDatabase } from 'nestjs-boot/testing';

// Seed: returns map of collection names to inserted _id arrays
const ids = await seedDatabase(connection, {
  users: [{ name: 'Alice' }, { name: 'Bob' }],
  products: [{ title: 'Widget', price: 9.99 }],
});
// ids.users = ['64a...', '64b...']
// ids.products = ['64c...']

// Clean: drops all collections
await cleanDatabase(connection);
```

---

## Quick Reference

| Utility | Purpose |
|---------|---------|
| `createTestApp` | In-memory app with MongoDB, mock cache, auto-cleanup |
| `createTestSuite` | All-in-one suite with lifecycle + client + factory |
| `createTestClient` | Envelope-aware HTTP client (supertest) |
| `createGrpcTestClient` | In-process gRPC handler testing |
| `createMessageDispatcher` | MessagePattern/EventPattern dispatcher |
| `ContractVerifier` | Verify service contracts (class or instance level) |
| `createFactory` | Schema-aware factories with traits + sequences |
| `createTestJwt` | Generate test JWTs with default secret |
| `createTestApiKey` | Generate deterministic API keys |
| `createAuthenticatedRequest` | Mock request with Bearer token |
| `MockAuthModule` | Bypass auth guards globally in tests |
| `expectSnapshot` | Volatile-field-aware snapshot testing |
| `stripVolatileFields` | Strip IDs/timestamps for comparison |
| `seedDatabase` | Bulk insert fixture data |
| `cleanDatabase` | Drop all collections |
| `createMockGrpcService` | Mock gRPC service object from response factories |

## See also

- [Authentication](authentication.md) — JWT and API key setup that `createTestJwt` and `MockAuthModule` mock
- [Database](database.md) — `BaseRepository` and `CachedBaseRepository` that `createTestApp` initializes
- [Transport & Microservices](transport-microservices.md) — `createGrpcTestClient` and `createMessageDispatcher` for microservice testing
