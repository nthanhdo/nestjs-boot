import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Module } from '@nestjs/common';
import {
  createMockGrpcService,
  ContractVerifier,
  createTestApp,
  seedDatabase,
  cleanDatabase,
} from '../../src/testing';
import type { TestAppContext, ContractDefinition } from '../../src/testing';
import mongoose from 'mongoose';

// --- Contract Testing ---

describe('createMockGrpcService', () => {
  it('creates a mock with callable methods', async () => {
    const mock = createMockGrpcService({
      findOne: (req: { id: string }) => ({ id: req.id, name: 'Test' }),
      findAll: () => ({ items: [{ id: '1' }] }),
    });

    expect(mock.findOne({ id: '42' })).toEqual({ id: '42', name: 'Test' });
    expect(mock.findAll({})).toEqual({ items: [{ id: '1' }] });
  });

  it('supports async response factories', async () => {
    const mock = createMockGrpcService({
      findOne: async (req: { id: string }) => ({ id: req.id }),
    });

    const result = await mock.findOne({ id: 'abc' });
    expect(result).toEqual({ id: 'abc' });
  });
});

describe('ContractVerifier', () => {
  it('passes when service implements all contract methods', () => {
    class UserService {
      findOne() { return {}; }
      findAll() { return []; }
    }

    const contract: ContractDefinition = {
      methods: [
        { name: 'findOne', input: {}, output: {} },
        { name: 'findAll', input: {}, output: {} },
      ],
    };

    const result = ContractVerifier.verify(UserService, contract);
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects missing methods', () => {
    class UserService {
      findOne() { return {}; }
    }

    const contract: ContractDefinition = {
      methods: [
        { name: 'findOne', input: {}, output: {} },
        { name: 'findAll', input: {}, output: {} },
        { name: 'create', input: {}, output: {} },
      ],
    };

    const result = ContractVerifier.verify(UserService, contract);
    expect(result.pass).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toContain('findAll');
    expect(result.violations[1]).toContain('create');
  });
});

// --- Integration Testing ---

@Module({})
class TestAppModule {}

describe('Integration test helpers', () => {
  let ctx: TestAppContext;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    ctx = await createTestApp(TestAppModule);
    // Connect directly to the in-memory MongoDB for seed/clean tests
    connection = await mongoose.createConnection(ctx.mongoUri).asPromise();
  }, 30_000); // MongoMemoryServer can take time to download/start

  afterAll(async () => {
    if (connection) await connection.close();
    if (ctx) await ctx.cleanup();
  }, 15_000);

  afterEach(async () => {
    if (connection?.db) {
      await cleanDatabase(connection);
    }
  });

  it('createTestApp starts app with in-memory MongoDB', () => {
    expect(ctx.app).toBeDefined();
    expect(ctx.mongoUri).toMatch(/^mongodb:\/\//);
    expect(ctx.cleanup).toBeInstanceOf(Function);
  });

  it('seedDatabase inserts fixtures and returns IDs', async () => {
    const ids = await seedDatabase(connection, {
      users: [
        { name: 'Alice', email: 'alice@test.com' },
        { name: 'Bob', email: 'bob@test.com' },
      ],
      products: [{ title: 'Widget', price: 9.99 }],
    });

    expect(ids.users).toHaveLength(2);
    expect(ids.products).toHaveLength(1);

    // Verify data is actually in the database
    const users = await connection.collection('users').find().toArray();
    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('Alice');
  });

  it('cleanDatabase removes all data', async () => {
    // Seed first
    await seedDatabase(connection, {
      users: [{ name: 'Alice' }],
      products: [{ title: 'Widget' }],
    });

    // Verify data exists
    let collections = await connection.db.listCollections().toArray();
    expect(collections.length).toBeGreaterThan(0);

    // Clean
    await cleanDatabase(connection);

    // Verify all collections dropped
    collections = await connection.db.listCollections().toArray();
    expect(collections).toHaveLength(0);
  });
});
