import { Type } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { BootOptions } from '../../interfaces/boot-options.interface';

/**
 * Result of `createTestApp()` — includes cleanup handle.
 */
export interface TestAppContext {
  /** The NestJS application instance */
  app: INestApplication;
  /** The root testing module */
  module: unknown;
  /** The in-memory MongoDB URI (for direct Mongoose access if needed) */
  mongoUri: string;
  /** Call this in `afterAll` to stop memory server + close app */
  cleanup: () => Promise<void>;
}

/**
 * Create a test-ready NestJS application with in-memory infrastructure.
 *
 * - MongoDB: uses `mongodb-memory-server` (auto-start, auto-stop)
 * - Cache: uses `ioredis-mock` instead of real Redis
 * - Health: disabled
 * - Logging: silent
 *
 * ```ts
 * let ctx: TestAppContext;
 *
 * beforeAll(async () => {
 *   ctx = await createTestApp(AppModule);
 * });
 *
 * afterAll(async () => {
 *   await ctx.cleanup();
 * });
 * ```
 */
export async function createTestApp(
  AppModule: Type<unknown>,
  overrides?: Partial<BootOptions>,
): Promise<TestAppContext> {
  // Dynamic imports — these are devDependencies
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const { createApp } = await import('../../create-app');

  // Start in-memory MongoDB
  const mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Merge test defaults with user overrides
  const testOptions: BootOptions = {
    database: {
      connections: {
        master: { writerUri: mongoUri },
      },
    },
    cache: undefined, // No cache by default in tests
    health: { enabled: false },
    logger: false, // Silent
    ...overrides,
    // If overrides include database, use override connections but default master to in-memory URI
    ...(overrides?.database
      ? {
          database: {
            connections: {
              master: { writerUri: mongoUri },
              ...overrides.database.connections,
            },
          },
        }
      : {}),
  };

  const app = await createApp(AppModule, testOptions);
  await app.init();

  const cleanup = async () => {
    await app.close();
    await mongoServer.stop();
  };

  return {
    app,
    module: app,
    mongoUri,
    cleanup,
  };
}
