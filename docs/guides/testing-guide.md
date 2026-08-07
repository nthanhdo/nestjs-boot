# Testing Guide — nestjs-boot

> How to test every module type in a nestjs-boot application.

## Setup

nestjs-boot provides testing utilities out of the box:

```bash
npm install --save-dev vitest mongodb-memory-server
```

## 1. Testing a Service with BaseRepository

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createFactory } from 'nestjs-boot/testing';
import type { TestAppContext } from 'nestjs-boot/testing';
import { ProductModule } from './product.module';
import { ProductService } from './product.service';
import { ProductSchema } from './product.schema';

describe('ProductService', () => {
  let ctx: TestAppContext;
  let service: ProductService;
  const factory = createFactory('Product', ProductSchema, {
    name: () => `Product ${Math.random().toString(36).slice(2, 8)}`,
    price: () => Math.floor(Math.random() * 10000) / 100,
    category: 'electronics',
  });

  beforeAll(async () => {
    ctx = await createTestApp(ProductModule, { autoClean: true });
    service = ctx.app.get(ProductService);
  });

  beforeEach(() => ctx.beforeEachClean());
  afterAll(() => ctx.cleanup());

  it('should create a product', async () => {
    const data = factory.build();
    const result = await service.create(data);
    expect(result.name).toBe(data.name);
    expect(result._id).toBeDefined();
  });

  it('should paginate results', async () => {
    await factory.createMany(25, ctx.mongoConnection!);
    const page = await service.findAll({}, { page: 2, limit: 10 });
    expect(page.data).toHaveLength(10);
    expect(page.total).toBe(25);
    expect(page.page).toBe(2);
  });
});
```

## 2. Testing a Cached Service (Mock Cache)

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp } from 'nestjs-boot/testing';
import { CatalogModule } from './catalog.module';
import { CatalogService } from './catalog.service';
import { MultiCacheService } from 'nestjs-boot';

describe('CatalogService (cached)', () => {
  let ctx;
  let service: CatalogService;

  beforeAll(async () => {
    ctx = await createTestApp(CatalogModule, {
      overrideProviders: [
        {
          provide: MultiCacheService,
          useValue: {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
            del: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
    service = ctx.app.get(CatalogService);
  });

  afterAll(() => ctx.cleanup());

  it('should fall through to DB when cache misses', async () => {
    const result = await service.getCachedProduct('some-id');
    // Cache mock returns null → service hits DB
    expect(result).toBeNull(); // no product in test DB
  });
});
```

## 3. Testing a Controller with Guards

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestClient } from 'nestjs-boot/testing';
import type { TestClient } from 'nestjs-boot/testing';
import { ProductModule } from './product.module';

describe('ProductController', () => {
  let ctx;
  let client: TestClient;

  beforeAll(async () => {
    ctx = await createTestApp(ProductModule, {
      auth: {
        jwt: { secret: 'test-secret-at-least-8-chars' },
      },
      response: { envelope: true },
    });
    client = createTestClient(ctx.app);
  });

  afterAll(() => ctx.cleanup());

  it('GET /products should be public (no auth required)', async () => {
    const res = await client.get('/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /products should require auth', async () => {
    const res = await client.post('/products', { name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('POST /products with valid token should succeed', async () => {
    // Get a token from BootJwtService
    const jwtService = ctx.app.get('BootJwtService');
    const token = jwtService.sign({ sub: 'user-1', roles: ['admin'] });

    client.setBearerToken(token);
    const res = await client.post('/products', { name: 'Test Product' });
    expect(res.status).toBe(201);
  });

  it('DELETE /products/:id should require admin role', async () => {
    const jwtService = ctx.app.get('BootJwtService');
    const userToken = jwtService.sign({ sub: 'user-1', roles: ['user'] });

    client.setBearerToken(userToken);
    const res = await client.delete('/products/some-id');
    expect(res.status).toBe(403);
  });
});
```

## 4. Testing Event Handlers

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp } from 'nestjs-boot/testing';
import { EventBusService } from 'nestjs-boot';
import { OrderModule } from './order.module';

describe('Order Event Handlers', () => {
  let ctx;
  let eventBus: EventBusService;

  beforeAll(async () => {
    ctx = await createTestApp(OrderModule, {
      events: { transport: 'memory' },
    });
    eventBus = ctx.app.get(EventBusService);
  });

  afterAll(() => ctx.cleanup());

  it('should handle order.created event', async () => {
    const handler = vi.fn();
    eventBus.subscribe('order.created', handler);

    await eventBus.emit('order.created', { orderId: '123', total: 99.99 });

    // Allow async handler to process
    await new Promise((r) => setTimeout(r, 50));
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: '123' }),
    );
  });
});
```

## 5. Testing Inter-service Calls (Mock ServiceClient)

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp } from 'nestjs-boot/testing';
import { getClientToken, ServiceClient } from 'nestjs-boot';
import { PaymentModule } from './payment.module';
import { PaymentService } from './payment.service';

// Define the contract for the remote service
interface UserServiceContract {
  getUser(payload: { id: string }): Promise<{ id: string; name: string }>;
}

describe('PaymentService (mocked inter-service)', () => {
  let ctx;
  let service: PaymentService;

  const mockUserClient = {
    call: vi.fn().mockResolvedValue({ id: '1', name: 'John' }),
    emit: vi.fn(),
  };

  beforeAll(async () => {
    ctx = await createTestApp(PaymentModule, {
      overrideProviders: [
        {
          provide: getClientToken('USER_SERVICE'),
          useValue: mockUserClient,
        },
      ],
    });
    service = ctx.app.get(PaymentService);
  });

  afterAll(() => ctx.cleanup());

  it('should fetch user before processing payment', async () => {
    await service.processPayment({ userId: '1', amount: 50 });

    expect(mockUserClient.call).toHaveBeenCalledWith(
      'getUser',
      expect.objectContaining({ id: '1' }),
    );
  });
});
```

## 6. Contract Testing

Verify that a service implements the expected contract (method signatures + response shapes):

```ts
import { describe, it, expect } from 'vitest';
import { ContractVerifier } from 'nestjs-boot/testing';
import { z } from 'zod';
import { ProductService } from './product.service';

const productContract = {
  methods: [
    {
      name: 'findAll',
      input: z.object({}).optional(),
      output: z.object({
        data: z.array(z.any()),
        total: z.number(),
        page: z.number(),
        limit: z.number(),
      }),
    },
    {
      name: 'findById',
      input: z.string(),
      output: z.object({ name: z.string() }).nullable(),
    },
    {
      name: 'create',
      input: z.object({ name: z.string() }),
      output: z.object({ name: z.string(), _id: z.any() }),
    },
  ],
};

describe('ProductService Contract', () => {
  it('should implement all contract methods', () => {
    const result = ContractVerifier.verify(ProductService, productContract);
    expect(result.pass).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
```

## Quick Reference

| Utility | Import | Purpose |
|---------|--------|---------|
| `createTestApp` | `nestjs-boot/testing` | In-memory app with MongoDB, auto-cleanup |
| `createFactory` | `nestjs-boot/testing` | Schema-aware test data factories |
| `createTestClient` | `nestjs-boot/testing` | Envelope-aware HTTP client (supertest) |
| `ContractVerifier` | `nestjs-boot/testing` | Verify service contracts (class or instance) |
| `cleanDatabase` | `nestjs-boot/testing` | Drop all collections |
| `seedDatabase` | `nestjs-boot/testing` | Bulk insert test data |
