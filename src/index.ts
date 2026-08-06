// --- Interfaces ---
export type {
  BootOptions,
  DatabaseOptions,
  ConnectionOptions,
  CacheOptions,
  RedisCacheOptions,
  MemcachedCacheOptions,
  ResponseOptions,
  HealthOptions,
} from './interfaces/boot-options.interface';

// --- Config ---
export {
  BootConfigModule,
  BootConfigService,
  BOOT_OPTIONS,
  bootOptionsSchema,
  validateBootOptions,
} from './config';

// --- Database ---
export {
  DatabaseModule,
  BaseRepository,
  CachedBaseRepository,
  InjectRepository,
  InjectConnection,
  createConnectionModules,
  DATABASE_CONNECTION_PREFIX,
  getWriterToken,
  getReaderToken,
  getModelToken,
  getWriterConnectionName,
  getReaderConnectionName,
} from './database';
export type { PaginatedResult, FindAllOptions } from './database';

// --- Common ---
export {
  ResponseInterceptor,
  AllExceptionsFilter,
} from './common';
export type { ResponseEnvelope, ErrorResponse } from './common';

// --- Health ---
export {
  HealthModule,
  HealthController,
  DatabaseHealthIndicator,
  RedisHealthIndicator,
} from './health';

// --- createApp ---
export { createApp } from './create-app';

// --- Cache ---
export {
  CacheModule,
  MultiCacheService,
  MemoryCacheAdapter,
  RedisCacheAdapter,
  InjectCache,
  CACHE_SERVICE,
  CACHE_OPTIONS,
} from './cache';
export type { CacheAdapter, CacheSetOptions } from './cache';
