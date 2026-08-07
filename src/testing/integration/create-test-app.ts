import { Type, Provider } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
import { BootOptions } from '../../interfaces/boot-options.interface';

/**
 * Options for createTestApp beyond BootOptions overrides.
 */
export interface CreateTestAppOptions extends Partial<BootOptions> {
  /**
   * Override DI providers — useful for mocking services in integration tests.
   *
   * ```ts
   * createTestApp(AppModule, {
   *   overrideProviders: [
   *     { provide: EmailService, useValue: { send: vi.fn() } },
   *   ],
   * })
   * ```
   */
  overrideProviders?: Provider[];

  /**
   * When true, returns a `beforeEachClean` function that drops all collections
   * in the in-memory MongoDB. Call it in your `beforeEach` hook for test isolation.
   *
   * ```ts
   * const ctx = await createTestApp(AppModule, { autoClean: true });
   * beforeEach(() => ctx.beforeEachClean());
   * afterAll(() => ctx.cleanup());
   * ```
   */
  autoClean?: boolean;
}

/**
 * Result of `createTestApp()` — includes cleanup handle.
 */
export interface TestAppContext {
  /** The NestJS application instance */
  app: INestApplication;
  /** The root testing module */
  module: TestingModule;
  /** The in-memory MongoDB URI (for direct Mongoose access if needed) */
  mongoUri: string;
  /** The Mongoose connection to the in-memory database */
  mongoConnection: Connection | undefined;
  /** Call this in `afterAll` to stop memory server + close app */
  cleanup: () => Promise<void>;
  /** When `autoClean: true`, call this in `beforeEach` to drop all collections */
  beforeEachClean: () => Promise<void>;
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
  overrides?: CreateTestAppOptions,
): Promise<TestAppContext> {
  // Dynamic imports — these are devDependencies
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const { createApp } = await import('../../create-app');

  // Start in-memory MongoDB
  const mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Separate overrideProviders and autoClean from BootOptions overrides
  const { overrideProviders, autoClean, ...bootOverrides } = overrides ?? {};

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
    ...bootOverrides,
    // If overrides include database, use override connections but default master to in-memory URI
    ...(bootOverrides?.database
      ? {
          database: {
            connections: {
              master: { writerUri: mongoUri },
              ...bootOverrides.database.connections,
            },
          },
        }
      : {}),
  };

  // If overrideProviders are specified, we need to use TestingModule approach
  if (overrideProviders && overrideProviders.length > 0) {
    const { Test } = await import('@nestjs/testing');
    const { validateBootOptions } = await import('../../config/validators');
    const { BootConfigModule } = await import('../../config/config.module');

    const validated = validateBootOptions(testOptions);

    let builder = Test.createTestingModule({
      imports: [BootConfigModule.register(validated), AppModule],
    });

    for (const provider of overrideProviders) {
      const prov = provider as any;
      if (prov.provide && prov.useValue !== undefined) {
        builder = builder.overrideProvider(prov.provide).useValue(prov.useValue);
      } else if (prov.provide && prov.useFactory) {
        builder = builder.overrideProvider(prov.provide).useFactory({ factory: prov.useFactory });
      } else if (prov.provide && prov.useClass) {
        builder = builder.overrideProvider(prov.provide).useClass(prov.useClass);
      }
    }

    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    // Try to get Mongoose connection
    let mongoConnection: Connection | undefined;
    try {
      const mongoose = await import('mongoose');
      mongoConnection = mongoose.connection;
    } catch {
      // mongoose not available
    }

    const cleanup = async () => {
      await app.close();
      await mongoServer.stop();
    };

    const beforeEachClean = async () => {
      if (autoClean && mongoConnection) {
        const { cleanDatabase } = await import('./clean-database');
        await cleanDatabase(mongoConnection);
      }
    };

    return {
      app,
      module: moduleRef,
      mongoUri,
      mongoConnection,
      cleanup,
      beforeEachClean,
    };
  }

  const app = await createApp(AppModule, testOptions);
  await app.init();

  // Try to get Mongoose connection
  let mongoConnection: Connection | undefined;
  try {
    const mongoose = await import('mongoose');
    mongoConnection = mongoose.connection;
  } catch {
    // mongoose not available
  }

  const cleanup = async () => {
    await app.close();
    await mongoServer.stop();
  };

  const beforeEachClean = async () => {
    if (autoClean && mongoConnection) {
      const { cleanDatabase } = await import('./clean-database');
      await cleanDatabase(mongoConnection);
    }
  };

  return {
    app,
    module: app as unknown as TestingModule,
    mongoUri,
    mongoConnection,
    cleanup,
    beforeEachClean,
  };
}
