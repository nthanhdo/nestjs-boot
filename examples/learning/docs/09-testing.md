# 09 - Testing

Tests prove your code works and prevent regressions when you change things.

## Types of Tests

| Type | What it tests | Speed | Scope |
|------|--------------|-------|-------|
| Unit | One function/class in isolation | Fast | Narrow |
| Integration | Multiple components together | Medium | Medium |
| E2E | Full HTTP request/response cycle | Slow | Wide |

## Unit Test Example

Test the service in isolation by mocking the database:

```typescript
import { Test } from '@nestjs/testing';
import { ProductService } from './product.service';
import { getModelToken } from '@nestjs/mongoose';

describe('ProductService', () => {
  let service: ProductService;
  let mockModel: any;

  beforeEach(async () => {
    // Create a mock Mongoose model
    mockModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getModelToken('Product'), useValue: mockModel },
      ],
    }).compile();

    service = module.get(ProductService);
  });

  it('should return empty list', async () => {
    const result = await service.findAll();
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
```

## E2E Test Example

Test the full HTTP flow:

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Products (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /products should return array', () => {
    return request(app.getHttpServer())
      .get('/products')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body.items)).toBe(true);
      });
  });
});
```

## Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Watch mode (re-runs on file changes)
npm test -- --watch
```

## What to Test

- **Always test**: business logic in services, edge cases, error paths
- **Sometimes test**: controllers (usually covered by e2e), DTOs
- **Rarely test**: decorators, config, third-party library wrappers

## Exercise

Try [Exercise 09: Write Tests](../exercises/09-write-tests.md)

---

Next: [10 - Docker](10-docker.md)
