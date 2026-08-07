import { DynamicModule, Global, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { CacheOptions } from '../interfaces/boot-options.interface';
import { MemoryCacheAdapter } from './adapters/memory-cache.adapter';
import { MemcachedCacheAdapter } from './adapters/memcached-cache.adapter';
import { RedisCacheAdapter } from './adapters/redis-cache.adapter';
import { CacheAdapter } from './interfaces';
import { MultiCacheService } from './multi-cache.service';
import { CACHE_SERVICE, CACHE_OPTIONS } from './constants';
import { CacheWarmer } from './cache-warming';
import { TaggedCacheService } from './cache-tags';
import { CacheStats } from './cache-stats';

/**
 * CacheModule — multi-layer cache with size-aware routing.
 *
 * - L1: in-memory LRU (default) or memcached (if configured) — requires memjs installed
 * - L2: optional Redis (RedisCacheAdapter) — requires ioredis installed
 *
 * Usage:
 * ```ts
 * CacheModule.register({
 *   memcached: { servers: 'localhost:11211' }, // optional L1 memcached
 *   redis: { url: 'redis://localhost:6379' },  // optional L2 redis
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static memcachedClient: any = null;

  static register(options: CacheOptions): DynamicModule {
    const providers = [
      {
        provide: CACHE_OPTIONS,
        useValue: options,
      },
      {
        provide: CACHE_SERVICE,
        useFactory: () => {
          // L1: memcached (if configured) or in-memory LRU
          let l1: CacheAdapter;

          if (options.memcached?.servers) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const memjs = require('memjs');
              // Clean up previous client if register() called multiple times (e.g. testing)
              if (CacheModule.memcachedClient) {
                try { CacheModule.memcachedClient.close(); } catch { /* best effort */ }
              }
              const client = memjs.Client.create(options.memcached.servers);
              CacheModule.memcachedClient = client;
              l1 = new MemcachedCacheAdapter(client);
              CacheModule.logger.log('Memcached L1 cache connected');
            } catch {
              CacheModule.logger.warn(
                'memjs not installed — falling back to in-memory LRU for L1 cache. Install memjs for memcached support.',
              );
              l1 = new MemoryCacheAdapter(1000);
            }
          } else {
            l1 = new MemoryCacheAdapter(1000);
          }

          // L2: optional Redis
          let l2: RedisCacheAdapter | null = null;

          if (options.redis?.url) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const Redis = require('ioredis');
              // Clean up previous client if register() called multiple times (e.g. testing)
              if (CacheModule.redisClient) {
                try { CacheModule.redisClient.quit(); } catch { /* best effort */ }
              }
              const client = new Redis(options.redis.url);
              CacheModule.redisClient = client;
              l2 = new RedisCacheAdapter(client);
              CacheModule.logger.log('Redis L2 cache connected');
            } catch {
              CacheModule.logger.warn(
                'ioredis not installed — running with L1 cache only. Install ioredis for Redis L2 cache.',
              );
            }
          }

          const defaultTtl = options.defaultTtl ?? 300;
          return new MultiCacheService(l1, l2, defaultTtl);
        },
      },
    ];

    providers.push(
      {
        provide: CacheWarmer.name,
        useFactory: (cacheService: MultiCacheService) => new CacheWarmer(cacheService),
        inject: [CACHE_SERVICE],
      } as any,
      {
        provide: TaggedCacheService.name,
        useFactory: (cacheService: MultiCacheService) => new TaggedCacheService(cacheService),
        inject: [CACHE_SERVICE],
      } as any,
      CacheStats as any,
    );

    return {
      module: CacheModule,
      global: true,
      providers,
      exports: [CACHE_SERVICE, CacheWarmer.name, TaggedCacheService.name, CacheStats as any],
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
    if (CacheModule.memcachedClient) {
      try {
        CacheModule.memcachedClient.close();
        CacheModule.logger.log('Memcached connection closed');
      } catch {
        CacheModule.logger.warn('Failed to close Memcached connection gracefully');
      }
      CacheModule.memcachedClient = null;
    }
  }
}
