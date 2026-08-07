# Exercise 09: Write Unit + E2E Tests for Product

**Objective:** Write tests that verify your Product CRUD operations work correctly.

## Context

Tests are your safety net. They catch bugs before users do and let you refactor with confidence.

## Steps

### Part A: Unit Test

1. **Create `src/product/product.service.spec.ts`:**

```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { ProductService } from './product.service';

describe('ProductService', () => {
  let service: ProductService;
  let mockModel: any;

  beforeEach(async () => {
    // Create mock Mongoose model
    mockModel = {
      // TODO: mock find(), findById(), etc.
    };

    const module = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getModelToken('Product'), useValue: mockModel },
      ],
    }).compile();

    service = module.get(ProductService);
  });

  describe('findOne', () => {
    it('should return a product when found', async () => {
      // TODO: mock findById to return a product
      // TODO: call service.findOne(id)
      // TODO: expect the result to match
    });

    it('should throw NotFoundException when not found', async () => {
      // TODO: mock findById to return null
      // TODO: expect service.findOne('nonexistent') to throw
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      // TODO
    });
  });
});
```

2. **Fill in the TODO sections.** Mock Mongoose methods to return test data.

### Part B: E2E Test

1. **Create `test/products.e2e-spec.ts`:**
   - Use `@nestjs/testing` to create a real app instance
   - Use `supertest` to send HTTP requests
   - Test: create a product, read it, update it, delete it

## Hints

- Mock `.exec()` on Mongoose queries: `{ exec: jest.fn().mockResolvedValue(data) }`
- Chain mocks: `find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ ... }) })`
- For NotFoundException test: `expect(service.findOne('bad')).rejects.toThrow(NotFoundException)`

## How to Verify

```bash
npm test                    # unit tests
npm run test:e2e            # e2e tests
```

All tests should pass.

## Solution

Stuck? See [solutions/09-solution/](../solutions/09-solution/)
