import { DynamicModule, Global, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { CacheOptions } from '../interfaces/boot-options.interface';
import { MemoryCacheAdapter } from './adapters/memory-cache.adapter';
import { RedisCacheAdapter } from './adapters/redis-cache.adapter';
import { MultiCacheService } from './multi-cache.service';
import { CACHE_SERVICE, CACHE_OPTIONS } from './constants';

/**
 * CacheModule — multi-layer cache with size-aware routing.
 *
 * - L1: always in-memory LRU (MemoryCacheAdapter)
 * - L2: optional Redis (RedisCacheAdapter) — requires ioredis installed
 *
 * Usage:
 * ```ts
 * CacheModule.register({
 *   redis: { url: 'redis://localhost:6379' },
 *   defaultTtl: 300,
 * })
 * ```
 */
@Global()
@Module({})
export class CacheModule implements OnModuleDestroy {
  private static logger = new Logger('CacheModule');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static redisClient: any = null;

  static register(options: CacheOptions): DynamicModule {
    const providers = [
      {
        provide: CACHE_OPTIONS,
        useValue: options,
      },
      {
        provide: CACHE_SERVICE,
        useFactory: () => {
          // L1: always in-memory LRU
          const l1 = new MemoryCacheAdapter(1000);

          // L2: optional Redis
          let l2: RedisCacheAdapter | null = null;

          if (options.redis?.url) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const Redis = require('ioredis');
              const client = new Redis(options.redis.url);
              CacheModule.redisClient = client;
              l2 = new RedisCacheAdapter(client);
              CacheModule.logger.log('Redis L2 cache connected');
            } catch {
              CacheModule.logger.warn(
                'ioredis not installed — running with L1 (in-memory) cache only. Install ioredis for Redis L2 cache.',
              );
            }
          }

          const defaultTtl = options.defaultTtl ?? 300;
          return new MultiCacheService(l1, l2, defaultTtl);
        },
      },
    ];

    return {
      module: CacheModule,
      global: true,
      providers,
      exports: [CACHE_SERVICE],
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (CacheModule.redisClient) {
      try {
        await CacheModule.redisClient.quit();
        CacheModule.logger.log('Redis connection closed');
      } catch {
        CacheModule.logger.warn('Failed to close Redis connection gracefully');
      }
      CacheModule.redisClient = null;
    }
  }
}
