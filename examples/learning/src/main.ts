// ============================================================
// LESSON 1: How createApp() works
// ============================================================
//
// createApp() is the core of nestjs-boot. It replaces 40+ lines
// of manual module wiring with a single config object.
//
// How it works under the hood:
//   1. Validates your config via Joi (typos caught at startup)
//   2. Dynamically builds NestJS modules for each feature you enable
//   3. Creates the NestJS application
//   4. Applies global interceptors, filters, guards
//   5. Connects microservice transports (if configured)
//
// KEY INSIGHT: Every section in the config object is OPTIONAL.
// Omit a section = that feature is not loaded. This means you
// can start simple and add features incrementally.
//
// TRY IT: Comment out the `cache` section below, restart the app,
// and notice that Redis is no longer required. That's the power
// of opt-in configuration.
// ============================================================

import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  // createApp() takes two arguments:
  //   1. Your AppModule (where YOUR code lives -- controllers, services, etc.)
  //   2. A BootOptions config object (infrastructure setup)
  //
  // It returns a standard NestJS INestApplication -- you can use
  // all the usual NestJS methods on it (enableCors, useGlobalPipes, etc.)

  const app = await createApp(AppModule, {
    // --------------------------------------------------------
    // DATABASE -- MongoDB connection
    // --------------------------------------------------------
    // nestjs-boot manages Mongoose connections for you.
    // 'master' is just a name -- you can have multiple:
    //   connections: { master: {...}, analytics: {...}, logs: {...} }
    //
    // Each connection can optionally have a readerUri for
    // read-replica routing (writes go to writerUri, reads to readerUri).
    database: {
      connections: {
        master: {
          writerUri: process.env.MONGO_URI || 'mongodb://localhost:27017/learning',
          // Optional: add readerUri for read replicas
          // readerUri: process.env.MONGO_READER_URI,
        },
      },
    },

    // --------------------------------------------------------
    // CACHE -- Multi-layer: L1 (in-memory) + L2 (Redis)
    // --------------------------------------------------------
    // When you read from cache, nestjs-boot checks:
    //   L1 (in-memory, ~1ms) -> L2 (Redis, ~5ms) -> database (~50ms)
    //
    // When a value is found in L2 but not L1, it's written back to
    // L1 automatically (called "write-back"). This means frequently
    // accessed data stays in the fastest layer.
    cache: {
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
      defaultTtl: 300, // 5 minutes in seconds
    },

    // --------------------------------------------------------
    // AUTH -- JWT authentication + RBAC
    // --------------------------------------------------------
    // When enabled, nestjs-boot auto-registers:
    //   - JwtAuthGuard (validates Bearer tokens)
    //   - RolesGuard (checks @Roles('admin'))
    //   - @Public() decorator (skip auth for specific endpoints)
    //   - BootJwtService (sign/verify tokens in your services)
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET || 'learning-project-secret-change-me',
        signOptions: { expiresIn: '15m' },
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'learning-project-refresh-secret',
        refreshExpiresIn: '7d',
      },
    },

    // --------------------------------------------------------
    // RESPONSE -- Unified error handling
    // --------------------------------------------------------
    // errorHandler: true wraps unhandled exceptions in a consistent
    // JSON envelope: { statusCode, message, error, timestamp, path }
    //
    // Without this, NestJS returns different error shapes depending
    // on where the error was thrown. This normalizes everything.
    response: {
      errorHandler: true,
      // envelope: true,  // Uncomment to wrap ALL responses in { data, meta }
    },

    // --------------------------------------------------------
    // HEALTH -- Health check endpoint
    // --------------------------------------------------------
    // Creates GET /health that checks MongoDB + Redis connectivity.
    // Load balancers and Kubernetes use this to know if your app is alive.
    health: {
      enabled: true,
      path: '/health',  // default, shown here for clarity
    },
  });

  // --------------------------------------------------------
  // Start listening for HTTP requests
  // --------------------------------------------------------
  const port = process.env.PORT || 3000;
  await app.listen(port);

  // TIP: After starting, try these commands in another terminal:
  //   curl http://localhost:3000/health
  //   curl http://localhost:3000/products
  //   curl -X POST http://localhost:3000/products \
  //     -H "Content-Type: application/json" \
  //     -d '{"name":"Wireless Mouse","price":29.99,"stock":100}'
  console.log(`
  =========================================
   Learning Server running on port ${port}
  =========================================

   Health check:  http://localhost:${port}/health
   Products:      http://localhost:${port}/products

   Next lesson: Open src/app.module.ts
  `);
}

bootstrap();
