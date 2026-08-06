/**
 * Per-connection configuration for a MongoDB database.
 */
export interface ConnectionOptions {
  /** Primary (writer) MongoDB URI — required */
  writerUri: string;
  /** Read-replica MongoDB URI — optional. Reads auto-route here when provided. */
  readerUri?: string;
}

/**
 * Database configuration — one or more named connections.
 */
export interface DatabaseOptions {
  connections: Record<string, ConnectionOptions>;
}

/**
 * Redis connection options for L2 cache.
 */
export interface RedisCacheOptions {
  url: string;
}

/**
 * Cache configuration — multi-layer (L1 in-memory + L2 Redis).
 */
export interface CacheOptions {
  /** Redis config for L2 cache layer */
  redis?: RedisCacheOptions;
  /** Default TTL in seconds (default: 300) */
  defaultTtl?: number;
}

/**
 * Response envelope + error handling options.
 */
export interface ResponseOptions {
  /** Enable unified response envelope interceptor (default: false — opt-in) */
  envelope?: boolean;
  /** Enable global all-exceptions filter (default: true) */
  errorHandler?: boolean;
}

/**
 * Health check endpoint options.
 */
export interface HealthOptions {
  /** Enable health endpoint (default: true) */
  enabled?: boolean;
  /** Health endpoint path (default: '/health') */
  path?: string;
}

/**
 * Master configuration object for nestjs-boot.
 * Pass to `createApp()` — each section is optional.
 * Omitted sections = module not loaded.
 */
export interface BootOptions {
  /** MongoDB database configuration (multi-connection, reader/writer split) */
  database?: DatabaseOptions;
  /** Cache configuration (L1 in-memory + L2 Redis) */
  cache?: CacheOptions;
  /** NestJS logger option (default: NestJS default logger). Set false to disable. */
  logger?: boolean | unknown;
  /** Response envelope + error handling */
  response?: ResponseOptions;
  /** Health check endpoint */
  health?: HealthOptions;
}
