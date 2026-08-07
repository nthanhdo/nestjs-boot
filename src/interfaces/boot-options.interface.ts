/**
 * Mongoose connection options passthrough.
 */
export interface MongooseConnectionOptions {
  maxPoolSize?: number;
  minPoolSize?: number;
  serverSelectionTimeoutMS?: number;
  socketTimeoutMS?: number;
  connectTimeoutMS?: number;
  heartbeatFrequencyMS?: number;
  retryWrites?: boolean;
  retryReads?: boolean;
  w?: string | number;
  wtimeoutMS?: number;
  journal?: boolean;
  authSource?: string;
  authMechanism?: string;
  ssl?: boolean;
  tls?: boolean;
  tlsCAFile?: string;
  tlsCertificateKeyFile?: string;
  replicaSet?: string;
  readPreference?: string;
  /** Any additional Mongoose ConnectOptions */
  [key: string]: unknown;
}

/**
 * Per-connection configuration for a MongoDB database.
 */
export interface ConnectionOptions {
  /** Primary (writer) MongoDB URI — required */
  writerUri: string;
  /** Read-replica MongoDB URI — optional. Reads auto-route here when provided. */
  readerUri?: string;
  /** Mongoose connection options (pool size, auth, timeouts, etc.) */
  options?: MongooseConnectionOptions;
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
/**
 * Memcached connection options.
 */
export interface MemcachedCacheOptions {
  /** Memcached server(s) — e.g., 'localhost:11211' or 'host1:11211,host2:11211' */
  servers: string;
}

/**
 * Cache configuration — multi-layer (L1 in-memory/memcached + L2 Redis).
 */
export interface CacheOptions {
  /** Redis config for L2 cache layer */
  redis?: RedisCacheOptions;
  /** Memcached config for L1 cache layer (replaces in-memory LRU) */
  memcached?: MemcachedCacheOptions;
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
 * Re-export AuthOptions so consumers can import from boot-options.
 */
export type { AuthOptions } from '../auth/interfaces';

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
  /** Auth + RBAC configuration (opt-in — omit to disable all auth) */
  auth?: import('../auth/interfaces').AuthOptions;
  /** Graceful shutdown configuration */
  shutdown?: import('../shutdown/interfaces').ShutdownOptions;
  /** Inter-service auth propagation (opt-in — omit to disable) */
  interServiceAuth?: import('../inter-service-auth/interfaces').InterServiceAuthOptions;
  /** Transport configuration for hybrid microservice support (gRPC, TCP, NATS, RMQ) */
  transport?: import('../transport/interfaces').TransportOptions;
  /** OpenTelemetry tracing configuration */
  tracing?: import('../tracing/interfaces').TracingOptions;
  /** Prometheus metrics configuration */
  metrics?: import('../metrics/interfaces').MetricsOptions;
  /** Structured logging (pino) configuration */
  logging?: import('../logging/interfaces').LoggingOptions;
  /** Resilience configuration (circuit breaker defaults, timeout) */
  resilience?: import('../resilience/interfaces').ResilienceOptions;
  /** Queue configuration (BullMQ) */
  queue?: import('../queue/interfaces').QueueOptions;
  /** Event bus configuration (memory or Redis pub/sub) */
  events?: import('../events/interfaces').EventBusOptions;
  /** Module layer enforcement (opt-in — validates import direction at boot) */
  layers?: import('../layers/layer-config').LayerOptions;
  /**
   * Lazy initialization mode (default: false).
   *
   * When `true`, database and cache connections are deferred until the first
   * request instead of connecting at bootstrap. This reduces cold start time
   * by 40–60% for environments like AWS Lambda.
   *
   * **Trade-off:** The first request in a new Lambda instance will be slower
   * because connections are established on demand. Subsequent requests reuse
   * the same connections.
   *
   * Only set this for serverless/FaaS deployments. Long-running services
   * should keep this `false` (default) so connections are validated at startup.
   *
   * See: docs/guides/serverless-considerations.md
   */
  lazy?: boolean;
  /** Monitoring hooks (Sentry, Datadog, etc.) — set callbacks without subclassing filters */
  monitoring?: {
    /** Called for every caught exception in HTTP and RPC filters */
    errorReporter?: (error: Error, context: Record<string, unknown>) => void;
  };
  /** Correlation ID middleware configuration */
  correlation?: {
    /** Header name (default: 'X-Correlation-Id') */
    header?: string;
    /** Custom ID generator (default: crypto.randomUUID()) */
    generator?: () => string;
  };
  /** API versioning configuration (opt-in — omit to disable) */
  versioning?: import('../versioning/interfaces').VersioningOptions;
  /** Multi-tenancy configuration (opt-in — omit to disable) */
  tenancy?: import('../tenancy/interfaces').TenancyOptions;
  /**
   * Swagger/OpenAPI configuration (opt-in — omit to disable).
   * Enabled by default in dev, disabled in prod.
   * Requires @nestjs/swagger peer dependency.
   */
  swagger?: import('../swagger/interfaces').SwaggerOptions;
  /**
   * WebSocket configuration (opt-in — omit to disable).
   * Supports Socket.IO (default) or native 'ws' adapter.
   * Redis adapter enables pub/sub across multiple NestJS instances.
   * Requires @nestjs/websockets + @nestjs/platform-socket.io peer dependencies.
   * For multi-instance scaling: also install @socket.io/redis-adapter + ioredis.
   */
  websocket?: import('../websocket/interfaces').WebSocketOptions;
  /**
   * Payment webhook handling + idempotency (PP19).
   * Registers POST /webhooks/stripe and POST /webhooks/paypal endpoints.
   * Verifies HMAC signatures; deduplicates events by event ID.
   * Requires NestJS rawBody:true — pass { rawBody: true } to NestFactory.create().
   */
  webhooks?: import('../payments/webhook.interfaces').WebhookModuleOptions;
  /**
   * File storage abstraction (PP20).
   * Drivers: 'local' (zero deps) | 's3' (requires @aws-sdk/client-s3) | 'gcs' (requires @google-cloud/storage).
   */
  storage?: import('../storage/storage.interface').StorageModuleOptions;
  /**
   * CQRS + Event Sourcing (PP21).
   * Provides CommandBus, EventStore (append-only persistence), AggregateRoot,
   * Projections, Snapshots, and Outbox pattern for guaranteed delivery.
   * EventStore backends: 'mongodb' (default, uses DatabaseModule) | 'memory' (testing).
   */
  cqrs?: import('../cqrs/interfaces').CqrsOptions;
}
