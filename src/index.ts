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
  mergeConfigs,
  formatConfigError,
  generateConfigDocs,
  ConfigWatcher,
} from './config';
export type { BootConfigAsyncOptions, BootConfigPath, ConfigSource } from './config';
export { EnvFileAdapter } from './config';
export { AwsSecretsAdapter } from './config';
export { VaultAdapter } from './config';

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
  BootException,
  ErrorCodes,
  errorBoundary,
  toProblemDetails,
  MongooseErrorInterceptor,
  ErrorReporter,
  CrudService,
  CrudController,
} from './common';
export type { ResponseEnvelope, ErrorResponse, BootExceptionOptions, CrudPaginatedResult, CrudFindAllOptions } from './common';

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
  WsJwtGuard,
  ApiKeyGuard,
  RolesGuard,
  PermissionsGuard,
  Roles,
  Permissions,
  Public,
  CurrentUser,
  AUTH_OPTIONS,
  ROLES_KEY,
  PERMISSIONS_KEY,
  IS_PUBLIC_KEY,
  // Social auth
  SocialAuthModule,
  GoogleStrategy,
  GitHubStrategy,
  SOCIAL_AUTH_OPTIONS,
  // TOTP
  TotpModule,
  TotpService,
  // Session
  SessionAuthModule,
  SessionGuard,
  Session,
  MemorySessionStore,
  SESSION_OPTIONS,
} from './auth';
export type {
  SocialProfile,
  SocialAuthOptions,
  SocialProviderConfig,
  SessionStore,
  SessionData,
  SessionModuleOptions,
} from './auth';

// --- Correlation ---
export {
  CorrelationModule,
  CorrelationIdMiddleware,
  CorrelationInterceptor,
  withCorrelationId,
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
  isKubernetesEnvironment,
  getK8sPreStopDelay,
  getK8sShutdownInfo,
  SHUTDOWN_OPTIONS,
  DEFAULT_SHUTDOWN_TIMEOUT,
  DEFAULT_SHUTDOWN_SIGNALS,
} from './shutdown';
export type { ShutdownOptions, DrainStrategy } from './shutdown';

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
  ServiceClient,
  InjectClient,
  InjectGrpcClient,
  getClientToken,
  createResilientClient,
  ResilientServiceClient,
  ServiceDiscoveryHook,
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
  isRetryable,
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
  BootTrace,
  TRACING_OPTIONS,
} from './tracing';
export type { TracingOptions } from './tracing';

// --- Metrics ---
export {
  MetricsModule,
  MetricsService,
  MetricsController,
  HttpMetricsInterceptor,
  DbMetricsInterceptor,
  CacheMetricsInterceptor,
  QueueMetrics,
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

// --- DI ---
export { parseDiError, formatDiError } from './di/di-error-handler';
export type { DiErrorInfo } from './di/di-error-handler';
export { StartupProfiler, createNoOpProfiler } from './di/startup-profiler';
export type { PhaseResult } from './di/startup-profiler';

// --- Contracts (interface-based DI) ---
export { createContract, InjectContract, provideContract, provideContractFactory, validateContracts } from './contracts';
export type { Contract, ContractType } from './contracts';

// --- Layers ---
export { Layer, LAYER_KEY, ModuleLayer, validateLayers } from './layers';
export type { LayerViolation, LayerValidationResult, LayerOptions } from './layers';

// --- Graph ---
export { analyzeModules, detectCycles, renderMermaid } from './graph';
export type { ModuleNode, GraphResult } from './graph';

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
  BootQuery,
  OnEvent,
  OnQuery,
  EVENT_BUS_OPTIONS,
  EVENT_BUS_SERVICE,
} from './events';
export type { EventBusOptions, OnEventOptions } from './events';

// --- Testing ---
export {
  createMockGrpcService,
  ContractVerifier,
  createTestApp,
  createTestSuite,
  seedDatabase,
  cleanDatabase,
  createFactory,
  createTestClient,
  createGrpcTestClient,
  createMessageDispatcher,
  createTestJwt,
  createTestApiKey,
  createAuthenticatedRequest,
  MockAuthModule,
  TEST_SECRET,
  expectSnapshot,
  stripVolatileFields,
} from './testing';
export type {
  ResponseFactory,
  ServiceDefinition,
  SchemaLike,
  ContractMethod,
  ContractDefinition,
  VerificationResult,
  TestAppContext,
  CreateTestAppOptions,
  TestFactory,
  TestClient,
  TestResponse,
  CreateTestJwtOptions,
} from './testing';

// --- Versioning (PP13) ---
export { VersioningModule } from './versioning';
export type { VersioningOptions } from './versioning';
export { ApiVersion, DeprecatedVersion, VersionInterceptor } from './versioning';
export { VERSIONING_OPTIONS, DEPRECATED_VERSION_KEY } from './versioning';

// --- Tenancy (PP14) ---
export { TenancyModule } from './tenancy';
export type { TenancyOptions } from './tenancy';
export {
  TenantContext,
  getTenantId,
  runWithTenant,
  TenantMiddleware,
  TenantGuard,
  TenantRequired,
  TenantScoped,
  CurrentTenant,
  TenantAwareRepository,
  RowIsolation,
  SchemaIsolation,
  DatabaseIsolation,
} from './tenancy';
export { TENANCY_OPTIONS, TENANT_REQUIRED_KEY, TENANT_SCOPED_KEY } from './tenancy';


// --- Migration System (PP15) ---
export { MigrationModule, MigrationRunner } from './database';
export type { Migration, MigrationResult, MigrationStatus, MigrationModuleOptions } from './database';

// --- Swagger/OpenAPI (PP16) ---
export { SwaggerModule, setupSwagger, SWAGGER_OPTIONS } from './swagger';
export type { SwaggerOptions } from './swagger';
export { ApiTag, ApiResponse, ApiPaginated, ApiErrorResponses, AutoApiProperties } from './swagger';

// --- WebSocket Scaling (PP17) ---
export { WebSocketModule, WS_OPTIONS, WS_REDIS_ADAPTER } from './websocket';
export { WsCorrelationInterceptor } from './websocket';
export { BootWsGateway } from './websocket';
export { createRedisAdapterFactory } from './websocket';
export {
  WsRoom,
  WsBroadcast,
  WsAuthRequired,
  OnConnection,
  OnDisconnection,
} from './websocket';
export type { WebSocketOptions, WebSocketRedisOptions, WebSocketCorsOptions } from './websocket';

// --- Advanced Cache Patterns (PP18) ---
export {
  CacheStampedeGuard,
  CacheWarmer,
  TaggedCacheService,
  CacheStats,
} from './cache';
export type { CacheWarmEntry, TaggedCacheOptions, CacheStatsResult } from './cache';

// --- Payment Webhook + Idempotency (PP19) ---
export { WebhookModule } from './payments';
export { WebhookController } from './payments';
export { IdempotencyGuard, Idempotent } from './payments';
export { StripeWebhookProvider, PayPalWebhookProvider } from './payments';
export { WEBHOOK_OPTIONS, IDEMPOTENCY_STORE } from './payments';
export type { WebhookEvent, WebhookProvider, WebhookModuleOptions } from './payments';

// --- File Storage Abstraction (PP20) ---
export { StorageModule, StorageService, FileValidationPipe, InjectStorage } from './storage';
export { LocalAdapter, S3Adapter, GCSAdapter } from './storage';
export { STORAGE_SERVICE, STORAGE_OPTIONS, STORAGE_ADAPTER } from './storage';
export type { StorageAdapter, StorageModuleOptions, StorageResult, UploadedFile } from './storage';
