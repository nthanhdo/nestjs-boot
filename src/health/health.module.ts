import { Controller, DynamicModule, Module, Provider } from '@nestjs/common';
import { TerminusModule, HealthIndicatorService } from '@nestjs/terminus';
import type { BootOptions } from '../interfaces/boot-options.interface';
import { CACHE_SERVICE } from '../cache/constants';
import { MultiCacheService } from '../cache/multi-cache.service';
import { QueueService } from '../queue/queue.service';
import { HealthController } from './health.controller';

// Lazy-load indicator symbols to avoid pulling hard dependencies (e.g. mongoose)
// when the corresponding driver is not configured.
const DATABASE_INDICATOR = 'DatabaseHealthIndicator';
const REDIS_INDICATOR = 'RedisHealthIndicator';
const QUEUE_INDICATOR = 'QueueHealthIndicator';

/**
 * HealthModule — auto-detects configured drivers and registers health indicators.
 *
 * - If `options.database` → DatabaseHealthIndicator (lazy-loaded to avoid mongoose dep)
 * - If `options.cache?.redis` → RedisHealthIndicator
 * - GET endpoint at `options.health?.path ?? '/health'`
 */
@Module({})
export class HealthModule {
  static register(options: BootOptions): DynamicModule {
    const path = options.health?.path ?? '/health';
    const providers: Provider[] = [];

    // Database health indicator — lazy-loaded to avoid top-level mongoose import
    if (options.database) {
      providers.push({
        provide: DATABASE_INDICATOR,
        useFactory: async (indicatorService: HealthIndicatorService) => {
          const { DatabaseHealthIndicator } = await import('./indicators/database.indicator');
          return new DatabaseHealthIndicator(options.database!, indicatorService);
        },
        inject: [HealthIndicatorService],
      });
    } else {
      providers.push({
        provide: DATABASE_INDICATOR,
        useValue: null,
      });
    }

    // Redis health indicator — properly wired via DI so CacheService is injected
    if (options.cache?.redis) {
      providers.push({
        provide: REDIS_INDICATOR,
        useFactory: async (indicatorService: HealthIndicatorService, cacheService: MultiCacheService) => {
          const { RedisHealthIndicator } = await import('./indicators/redis.indicator');
          return new RedisHealthIndicator(indicatorService, cacheService);
        },
        inject: [HealthIndicatorService, CACHE_SERVICE],
      });
    } else {
      providers.push({
        provide: REDIS_INDICATOR,
        useValue: null,
      });
    }

    // Queue health indicator — checks BullMQ Redis connectivity if queue is configured
    if (options.queue) {
      providers.push({
        provide: QUEUE_INDICATOR,
        useFactory: async (indicatorService: HealthIndicatorService, queueService?: QueueService) => {
          const { QueueHealthIndicator } = await import('./indicators/queue.indicator');
          return new QueueHealthIndicator(indicatorService, queueService);
        },
        inject: [HealthIndicatorService, { token: QueueService, optional: true }],
      });
    } else {
      providers.push({
        provide: QUEUE_INDICATOR,
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
