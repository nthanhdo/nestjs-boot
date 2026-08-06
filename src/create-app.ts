import { DynamicModule, Module, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { BootConfigModule } from './config/config.module';
import { validateBootOptions } from './config/validators';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { BootOptions } from './interfaces/boot-options.interface';

/**
 * createApp() — the soul of nestjs-boot.
 *
 * Takes a user's AppModule + a single BootOptions config object,
 * auto-wires infrastructure modules, and returns a ready NestJS app.
 *
 * ```ts
 * const app = await createApp(AppModule, {
 *   database: { connections: { master: { writerUri: '...' } } },
 *   cache: { redis: { url: 'redis://...' } },
 * });
 * await app.listen(3000);
 * ```
 */
export async function createApp(
  AppModule: Type<unknown>,
  options: BootOptions,
): Promise<INestApplication> {
  // 1. Validate options via Joi
  const validated = validateBootOptions(options);

  // 2. Build infrastructure imports dynamically
  const imports: DynamicModule[] = [BootConfigModule.register(validated)];

  if (validated.database) {
    imports.push(DatabaseModule.register(validated.database));
  }
  if (validated.cache) {
    imports.push(CacheModule.register(validated.cache));
  }
  if (validated.health?.enabled !== false) {
    imports.push(HealthModule.register(validated));
  }
  if (validated.auth) {
    imports.push(AuthModule.register(validated.auth));
  }

  // 3. Wrap user's AppModule with infrastructure
  @Module({ imports: [...imports, AppModule] })
  class BootWrappedModule {}

  // 4. Create NestJS app
  // Logger option: if user provides `logger` in BootOptions, use it; otherwise NestJS default
  const nestOptions: Record<string, unknown> = {};
  if (validated.logger !== undefined) {
    nestOptions.logger = validated.logger;
  }
  const app = await NestFactory.create(BootWrappedModule, nestOptions);

  // 5. Apply global interceptors/filters
  if (validated.response?.envelope) {
    app.useGlobalInterceptors(new ResponseInterceptor());
  }
  if (validated.response?.errorHandler !== false) {
    app.useGlobalFilters(new AllExceptionsFilter());
  }

  return app;
}
