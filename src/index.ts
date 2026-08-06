// --- Interfaces ---
export type {
  BootOptions,
  DatabaseOptions,
  ConnectionOptions,
  MongooseConnectionOptions,
  CacheOptions,
  RedisCacheOptions,
  MemcachedCacheOptions,
  ResponseOptions,
  HealthOptions,
  AuthOptions,
} from './interfaces/boot-options.interface';
export type {
  JwtAuthOptions,
  ApiKeyAuthOptions,
  RbacOptions,
} from './auth';

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
  InjectConnection,
  createConnectionModules,
  DATABASE_CONNECTION_PREFIX,
  getWriterToken,
  getReaderToken,
  getWriterConnectionName,
  getReaderConnectionName,
} from './database';
export type { PaginatedResult, FindAllOptions, ModelDefinition } from './database';

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

// --- Auth ---
export {
  AuthModule,
  BootJwtService,
  JwtAuthGuard,
  ApiKeyGuard,
  RolesGuard,
  PermissionsGuard,
  Roles,
  Permissions,
  Public,
  AUTH_OPTIONS,
  ROLES_KEY,
  PERMISSIONS_KEY,
  IS_PUBLIC_KEY,
} from './auth';

// --- createApp ---
export { createApp } from './create-app';

// --- Cache ---
export {
  CacheModule,
  MultiCacheService,
  MemoryCacheAdapter,
  RedisCacheAdapter,
  MemcachedCacheAdapter,
  InjectCache,
  CACHE_SERVICE,
  CACHE_OPTIONS,
} from './cache';
export type { CacheAdapter, CacheSetOptions } from './cache';
