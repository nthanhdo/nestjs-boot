export { CacheModule } from './cache.module';
export { MultiCacheService } from './multi-cache.service';
export { MemoryCacheAdapter } from './adapters/memory-cache.adapter';
export { RedisCacheAdapter } from './adapters/redis-cache.adapter';
export { InjectCache } from './decorators';
export { CACHE_SERVICE, CACHE_OPTIONS } from './constants';
export type { CacheAdapter, CacheSetOptions } from './interfaces';
