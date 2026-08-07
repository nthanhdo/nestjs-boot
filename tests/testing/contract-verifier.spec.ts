import { describe, it, expect } from 'vitest';
import { ContractVerifier } from '../../src/testing/contract/contract-verifier';

// Mock schema (Zod-like)
const mockSchema = {
  parse: (data: unknown) => {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Expected object');
    }
    return data;
  },
};

const stringSchema = {
  parse: (data: unknown) => {
    if (typeof data !== 'string') throw new Error('Expected string');
    return data;
  },
};

// Mock Joi-like schema
const joiSchema = {
  validate: (data: unknown) => {
    if (typeof data !== 'object' || data === null) {
      return { error: new Error('Expected object'), value: undefined };
    }
    return { error: undefined, value: data };
  },
};

// Test service
class TestService {
  async findOne(id: string) {
    return { id, name: 'Test' };
  }
  async findAll() {
    return [{ id: '1', name: 'Test' }];
  }
}

describe('ContractVerifier', () => {
  describe('verify (class-level)', () => {
    it('should pass when all methods exist', () => {
      const result = ContractVerifier.verify(TestService, {
        methods: [
          { name: 'findOne', input: stringSchema, output: mockSchema },
          { name: 'findAll', input: mockSchema, output: mockSchema },
        ],
      });
      expect(result.pass).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail for missing methods', () => {
      const result = ContractVerifier.verify(TestService, {
        methods: [
          { name: 'findOne', input: stringSchema, output: mockSchema },
          { name: 'nonExistent', input: mockSchema, output: mockSchema },
        ],
      });
      expect(result.pass).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('nonExistent');
    });
  });

  describe('verifyInstance (instance-level)', () => {
    it('should call methods and validate output', async () => {
      const service = new TestService();
      const result = await ContractVerifier.verifyInstance(service, {
        methods: [
          {
            name: 'findOne',
            input: stringSchema,
            output: mockSchema,
            testInput: '123',
          },
        ],
      });
      expect(result.pass).toBe(true);
    });

    it('should report output validation failures', async () => {
      const service = new TestService();
      const failSchema = {
        parse: () => { throw new Error('Invalid output shape'); },
      };
      const result = await ContractVerifier.verifyInstance(service, {
        methods: [
          {
            name: 'findOne',
            input: stringSchema,
            output: failSchema,
            testInput: '123',
          },
        ],
      });
      expect(result.pass).toBe(false);
      expect(result.violations[0]).toContain('Output validation failed');
    });

    it('should report missing methods on instance', async () => {
      const service = new TestService();
      const result = await ContractVerifier.verifyInstance(service as any, {
        methods: [
          { name: 'missing', input: mockSchema, output: mockSchema, testInput: {} },
        ],
      });
      expect(result.pass).toBe(false);
      expect(result.violations[0]).toContain('Missing method');
    });

    it('should work with Joi-style schemas', async () => {
      const service = new TestService();
      const result = await ContractVerifier.verifyInstance(service, {
        methods: [
          {
            name: 'findOne',
            input: stringSchema,
            output: joiSchema,
            testInput: '123',
          },
        ],
      });
      expect(result.pass).toBe(true);
    });

    it('should report methods that throw', async () => {
      const service = {
        broken: async () => { throw new Error('Boom'); },
      };
      const result = await ContractVerifier.verifyInstance(service, {
        methods: [
          { name: 'broken', input: mockSchema, output: mockSchema, testInput: {} },
        ],
      });
      expect(result.pass).toBe(false);
      expect(result.violations[0]).toContain('threw');
      expect(result.violations[0]).toContain('Boom');
    });
  });
});
