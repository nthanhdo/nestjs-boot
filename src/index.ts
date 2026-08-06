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
