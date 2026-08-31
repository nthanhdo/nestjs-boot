import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!jwtRefreshSecret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_REFRESH_SECRET must be set in production');
  }

  const app = await createApp(AppModule, {
    // ── Database ──
    database: {
      connections: {
        master: {
          writerUri: process.env.DATABASE_URL ?? 'mongodb://localhost:27017/backend-core',
        },
      },
    },

    // ── Auth ──
    auth: {
      jwt: {
        secret: jwtSecret ?? 'dev-secret-change-in-production-32ch',
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '1h' },
        refreshSecret:
          jwtRefreshSecret ?? 'dev-refresh-secret-change-32chars',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      },
      rbac: {
        enabled: true,
        denyByDefault: true,
        superAdmin: 'SUPER_ADMIN',
        hierarchy: [
          { name: 'SUPER_ADMIN', inherits: ['ADMIN'] },
          { name: 'ADMIN', inherits: ['MANAGER'] },
          { name: 'MANAGER', inherits: ['MODERATOR'] },
          { name: 'MODERATOR', inherits: ['LEADER'] },
          { name: 'LEADER', inherits: ['STAFF'] },
          { name: 'STAFF', inherits: ['USER'] },
          { name: 'USER' },
        ],
      },
      loginTracker: {
        maxAttempts: 5,
        lockoutDuration: 15 * 60 * 1000,
      },
    },

    // ── Observability ──
    correlation: {},
    logging: { level: process.env.LOG_LEVEL ?? 'info' },
    shutdown: { timeout: 10000 },

    // ── API ──
    swagger: {
      enabled: process.env.NODE_ENV !== 'production',
      path: '/api/docs',
    },
    versioning: { type: 'uri', defaultVersion: '1' },

    // ── Response ──
    response: {
      envelope: true,
      errorHandler: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
