import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {
    // --- Content Service (Headless CMS) ---
    content: {
      enabled: true,
      defaultLocale: process.env.CONTENT_DEFAULT_LOCALE || 'en',
      supportedLocales: (process.env.CONTENT_SUPPORTED_LOCALES || 'en,vi').split(','),
      enableCache: !!process.env.REDIS_URL,
      enableSearch: true,
      enableWebhooks: true,
      managementPrefix: '/api/content',
      deliveryPrefix: '/api/delivery',
      defaultPageSize: 25,
      cacheTtl: 300,
    },

    // --- Cache (Redis L2) ---
    ...(process.env.REDIS_URL && {
      cache: {
        redis: { url: process.env.REDIS_URL },
        defaultTtl: 300,
      },
    }),

    // --- Auth (JWT) ---
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET || 'change-me-in-production',
      },
    },

    // --- Observability ---
    health: { enabled: true },
    logging: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' },

    // --- Swagger ---
    swagger: {
      title: 'Monolith Content API',
      description: 'Headless CMS + Business modules — powered by nestjs-boot',
      version: '0.1.0',
    },

    // --- Response ---
    response: { envelope: true },

    // --- Graceful shutdown ---
    shutdown: { gracePeriodMs: 10_000 },
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
