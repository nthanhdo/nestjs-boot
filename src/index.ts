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

// --- Correlation ---
export {
  CorrelationModule,
  CorrelationIdMiddleware,
  getCorrelationId,
  setCorrelationId,
  runWithCorrelationId,
  CORRELATION_HEADER,
  CORRELATION_OPTIONS,
} from './correlation';
export type { CorrelationOptions } from './correlation';

// --- Shutdown ---
export {
  ShutdownModule,
  ShutdownService,
  SHUTDOWN_OPTIONS,
  DEFAULT_SHUTDOWN_TIMEOUT,
  DEFAULT_SHUTDOWN_SIGNALS,
} from './shutdown';
export type { ShutdownOptions } from './shutdown';

// --- Inter-Service Auth ---
export {
  InterServiceAuthModule,
  AuthPropagationInterceptor,
  getAuthContext,
  setAuthContext,
  runWithAuthContext,
  buildAuthHeaders,
  injectAuthIntoPayload,
  INTER_SERVICE_AUTH_OPTIONS,
} from './inter-service-auth';
export type { InterServiceAuthOptions, AuthContext } from './inter-service-auth';

// --- Transport ---
export {
  TransportModule,
  connectTransports,
  InjectClient,
  InjectGrpcClient,
  getClientToken,
  TRANSPORT_CLIENT_PREFIX,
  TRANSPORT_OPTIONS,
  TRANSPORT_TYPE_MAP,
} from './transport';
export type {
  TransportOptions,
  GrpcTransportOptions,
  TcpTransportOptions,
  NatsTransportOptions,
  RmqTransportOptions,
  ClientTransportOptions,
} from './transport';

// --- RPC ---
export {
  RpcModule,
  BootRpcExceptionFilter,
  deserializeRpcError,
  GrpcStatus,
  httpStatusToGrpc,
  grpcStatusToHttp,
  RPC_OPTIONS,
} from './rpc';
export type { RpcErrorEnvelope, RpcOptions } from './rpc';

// --- Tracing ---
export {
  TracingModule,
  TracingService,
  initTracing,
  TRACING_OPTIONS,
} from './tracing';
export type { TracingOptions } from './tracing';

// --- Metrics ---
export {
  MetricsModule,
  MetricsService,
  MetricsController,
  HttpMetricsInterceptor,
  METRICS_OPTIONS,
  METRICS_SERVICE,
  DEFAULT_METRICS_PATH,
} from './metrics';
export type { MetricsOptions } from './metrics';

// --- Logging ---
export {
  LoggingModule,
  BootLogger,
  LoggingInterceptor,
  LOGGING_OPTIONS,
} from './logging';
export type { LoggingOptions } from './logging';

// --- Resilience ---
export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerDecorator,
  Retry,
  Timeout,
  TimeoutInterceptor,
  CIRCUIT_BREAKER_OPTIONS,
  TIMEOUT_KEY,
  RESILIENCE_OPTIONS,
  DEFAULT_TIMEOUT,
} from './resilience';
export type {
  CircuitBreakerOptions,
  CircuitBreakerState,
  RetryOptions,
  ResilienceOptions,
} from './resilience';

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

// --- Queue ---
export {
  QueueModule,
  QueueService,
  Processor,
  Process,
  OnFailed,
  OnCompleted,
  QUEUE_OPTIONS,
  QUEUE_PREFIX,
} from './queue';
export type { QueueOptions } from './queue';

// --- Events ---
export {
  EventBusModule,
  EventBusService,
  BootEvent,
  OnEvent,
  EVENT_BUS_OPTIONS,
  EVENT_BUS_SERVICE,
} from './events';
export type { EventBusOptions, OnEventOptions } from './events';

// --- Testing ---
export {
  createMockGrpcService,
  ContractVerifier,
  createTestApp,
  seedDatabase,
  cleanDatabase,
} from './testing';
export type {
  ResponseFactory,
  ServiceDefinition,
  SchemaLike,
  ContractMethod,
  ContractDefinition,
  VerificationResult,
  TestAppContext,
} from './testing';
