import { Type } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
import { createTestApp, cleanDatabase } from './index';
import { createTestClient } from '../http';
import { createFactory } from '../factories';
import type { CreateTestAppOptions, TestAppContext } from './create-test-app';
import type { TestClient } from '../http/test-client';
import type { TestFactory } from '../factories/factory';
import type { Schema } from 'mongoose';

/**
 * A fully isolated test suite that wraps createTestApp + createFactory + createTestClient.
 *
 * ```ts
 * const suite = createTestSuite(AppModule, { response: { envelope: true } });
 *
 * beforeAll(() => suite.setup());
 * afterAll(() => suite.teardown());
 * beforeEach(() => suite.reset());
 *
 * it('test', async () => {
 *   const products = await suite.factory('Product', ProductSchema, defaults).createMany(5, suite.connection!);
 *   const res = await suite.client.get('/products');
 *   expect(res.data).toHaveLength(5);
 * });
 * ```
 */
export interface TestSuite {
  /** Initialize the test app. Call in beforeAll. */
  setup(): Promise<void>;
  /** Tear down the test app. Call in afterAll. */
  teardown(): Promise<void>;
  /** Reset state (clean DB). Call in beforeEach. */
  reset(): Promise<void>;
  /** The NestJS application instance (available after setup). */
  app: INestApplication;
  /** The testing module (available after setup). */
  module: TestingModule;
  /** HTTP test client with envelope unwrap (available after setup). */
  client: TestClient;
  /** Mongoose connection (available after setup, may be undefined). */
  connection: Connection | undefined;
  /** Resolve a provider from the DI container. */
  inject<T>(token: Type<T> | string | symbol): T;
  /** Create a factory bound to this suite (convenience). */
  factory<T extends Record<string, any>>(
    modelName: string,
    schema: Schema,
    defaults: Record<string, any>,
  ): TestFactory<T>;
}

/**
 * Create a fully isolated test suite with auto-cleanup.
 * Each test gets a clean database when you call `suite.reset()` in beforeEach.
 */
export function createTestSuite(
  AppModule: Type<unknown>,
  options?: CreateTestAppOptions,
): TestSuite {
  let ctx: TestAppContext | null = null;
  let client: TestClient | null = null;

  const suite: TestSuite = {
    get app() {
      if (!ctx) throw new Error('[nestjs-boot] TestSuite not initialized. Call suite.setup() in beforeAll.');
      return ctx.app;
    },
    get module() {
      if (!ctx) throw new Error('[nestjs-boot] TestSuite not initialized. Call suite.setup() in beforeAll.');
      return ctx.module as TestingModule;
    },
    get client() {
      if (!client) throw new Error('[nestjs-boot] TestSuite not initialized. Call suite.setup() in beforeAll.');
      return client;
    },
    get connection() {
      return ctx?.mongoConnection;
    },

    async setup() {
      ctx = await createTestApp(AppModule, { autoClean: true, ...options });
      client = createTestClient(ctx.app);
    },

    async teardown() {
      if (ctx) {
        await ctx.cleanup();
        ctx = null;
        client = null;
      }
    },

    async reset() {
      if (ctx?.mongoConnection?.db) {
        await cleanDatabase(ctx.mongoConnection);
      }
    },

    inject<T>(token: Type<T> | string | symbol): T {
      if (!ctx) throw new Error('[nestjs-boot] TestSuite not initialized.');
      return ctx.app.get(token as Type<T>);
    },

    factory<T extends Record<string, any>>(
      modelName: string,
      schema: Schema,
      defaults: Record<string, any>,
    ): TestFactory<T> {
      return createFactory<T>(modelName, schema, defaults);
    },
  };

  return suite;
}
