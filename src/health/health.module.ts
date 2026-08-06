import { Controller, DynamicModule, Module, Provider } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BootOptions } from '../interfaces/boot-options.interface';
import { CACHE_SERVICE } from '../cache/constants';
import { MultiCacheService } from '../cache/multi-cache.service';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { RedisHealthIndicator } from './indicators/redis.indicator';
import { HealthController } from './health.controller';

/**
 * HealthModule — auto-detects configured drivers and registers health indicators.
 *
 * - If `options.database` → DatabaseHealthIndicator
 * - If `options.cache?.redis` → RedisHealthIndicator (wired via DI with CacheService)
 * - GET endpoint at `options.health?.path ?? '/health'`
 */
@Module({})
export class HealthModule {
  static register(options: BootOptions): DynamicModule {
    const path = options.health?.path ?? '/health';
    const providers: Provider[] = [];

    // Database health indicator
    if (options.database) {
      providers.push({
        provide: DatabaseHealthIndicator,
        useFactory: () => new DatabaseHealthIndicator(options.database!),
      });
    } else {
      providers.push({
        provide: DatabaseHealthIndicator,
        useValue: null,
      });
    }

    // Redis health indicator — properly wired via DI so CacheService is injected
    if (options.cache?.redis) {
      providers.push({
        provide: RedisHealthIndicator,
        useFactory: (cacheService: MultiCacheService) => new RedisHealthIndicator(cacheService),
        inject: [CACHE_SERVICE],
      });
    } else {
      providers.push({
        provide: RedisHealthIndicator,
        useValue: null,
      });
    }

    // Dynamic controller with configured path
    @Controller(path)
    class DynamicHealthController extends HealthController {}

    return {
      module: HealthModule,
      imports: [TerminusModule],
      controllers: [DynamicHealthController],
      providers,
    };
  }
}
