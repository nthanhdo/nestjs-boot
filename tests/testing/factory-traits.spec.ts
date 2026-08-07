import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Schema } from 'mongoose';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createFactory } from '../../src/testing';

interface Product {
  name: string;
  price: number;
  category: string;
  stock: number;
}

const ProductSchema = new Schema({
  name: String,
  price: Number,
  category: String,
  stock: Number,
});

describe('Factory traits and sequences', () => {
  let mongoServer: MongoMemoryServer;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongoServer.getUri()).asPromise();
  }, 30_000);

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  }, 15_000);

  afterEach(async () => {
    if (connection.db) {
      const collections = await connection.db.listCollections().toArray();
      await Promise.all(collections.map((c) => connection.db!.dropCollection(c.name)));
    }
  });

  it('applies named traits to override specific fields', () => {
    const factory = createFactory<Product>('Product', ProductSchema, {
      name: () => 'Default Product',
      price: () => 10,
      category: 'electronics',
      stock: 50,
    }, {
      traits: {
        expensive: { price: () => 999 },
        outOfStock: { stock: 0 },
      },
    });

    const normal = factory.build();
    expect(normal.price).toBe(10);
    expect(normal.stock).toBe(50);

    const expensive = factory.build('expensive');
    expect(expensive.price).toBe(999);
    expect(expensive.stock).toBe(50); // untouched

    const oos = factory.build('outOfStock');
    expect(oos.stock).toBe(0);
    expect(oos.price).toBe(10); // untouched
  });

  it('supports sequence numbers in field generators', () => {
    const factory = createFactory<{ email: string; name: string }>('User', new Schema({ email: String, name: String }), {
      email: (seq: number) => `user-${seq}@test.com`,
      name: (seq: number) => `User ${seq}`,
    });

    factory.resetSequence();

    const u1 = factory.build();
    const u2 = factory.build();
    const u3 = factory.build();

    expect(u1.email).toBe('user-1@test.com');
    expect(u2.email).toBe('user-2@test.com');
    expect(u3.email).toBe('user-3@test.com');
    expect(u1.name).toBe('User 1');
  });

  it('calls afterCreate hook after database insert', async () => {
    const hookFn = vi.fn();
    const factory = createFactory<Product>('ProductHook', ProductSchema, {
      name: () => 'Hooked Product',
      price: () => 42,
      category: 'test',
      stock: 10,
    }, {
      afterCreate: async (doc, conn) => {
        hookFn(doc.name, doc._id);
      },
    });

    const created = await factory.create(connection);
    expect(hookFn).toHaveBeenCalledTimes(1);
    expect(hookFn).toHaveBeenCalledWith('Hooked Product', created._id);
  });

  it('throws on unknown trait name', () => {
    const factory = createFactory<Product>('Product2', ProductSchema, {
      name: () => 'Test',
      price: () => 10,
      category: 'x',
      stock: 1,
    }, {
      traits: { premium: { price: () => 500 } },
    });

    expect(() => factory.build('nonexistent')).toThrow('Unknown factory trait');
  });
});
