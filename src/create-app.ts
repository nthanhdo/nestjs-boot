import { DynamicModule, Module, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { BootConfigModule } from './config/config.module';
import { validateBootOptions } from './config/validators';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { BootOptions } from './interfaces/boot-options.interface';
import { parseDiError, formatDiError } from './di/di-error-handler';
import { scanForCircularDepWarnings } from './di/circular-dep-scanner';
import { validateLayers } from './layers/layer-enforcer';

// --- Lazy loaders for optional heavy modules ---
// These are loaded on-demand so consumers don't need peer deps they don't use.

function lazyDatabase() {
  return require('./database/database.module').DatabaseModule;
}
function lazyCache() {
  return require('./cache/cache.module').CacheModule;
}
function lazyHealth() {
  return require('./health/health.module').HealthModule;
}
function lazyAuth() {
  return require('./auth/auth.module').AuthModule;
}
function lazyCorrelation() {
  return require('./correlation/correlation.module').CorrelationModule;
}
function lazyShutdown() {
  return require('./shutdown/shutdown.module').ShutdownModule;
}
function lazyTransport() {
  return require('./transport/transport.module').TransportModule;
}
function lazyInterServiceAuth() {
  return require('./inter-service-auth/inter-service-auth.module').InterServiceAuthModule;
}
function lazyRpc() {
  return require('./rpc/rpc.module').RpcModule;
}
function lazyConnectTransports() {
  return require('./transport/transport.factory').connectTransports;
}
function lazyMetrics() {
  return require('./metrics/metrics.module').MetricsModule;
}
function lazyLogging() {
  return require('./logging/logging.module').LoggingModule;
}
function lazyTracing() {
  return require('./tracing/tracing.module').TracingModule;
}
function lazyInitTracing() {
  return require('./tracing/init-tracing').initTracing;
}
function lazyQueue() {
  return require('./queue/queue.module').QueueModule;
}
function lazyEventBus() {
  return require('./events/event-bus.module').EventBusModule;
}
function lazyCqrs() {
  return require('./cqrs/cqrs.module').CqrsModule;
}
function lazyVersioning() {
  return require('./versioning/versioning.module').VersioningModule;
}
function lazyTenancy() {
  return require('./tenancy/tenancy.module').TenancyModule;
}
function lazyWebSocket() {
  return require('./websocket/websocket.module').WebSocketModule;
}
function lazyDeploy() {
  return {
    DeployHooksModule: require('./deploy/deploy.module').DeployHooksModule,
    DeployService: require('./deploy/deploy.service').DeployService,
    EnvValidationHook: require('./deploy/hooks/env-validation.hook').EnvValidationHook,
    ReadinessGateHook: require('./deploy/hooks/readiness-gate.hook').ReadinessGateHook,
  };
}
function lazySwagger() {
  return require('./swagger/swagger.setup').setupSwagger;
}

/**
 * Load .env files using dotenv.
 * Supports environment profiles: `.env.{BOOT_ENV || NODE_ENV}` overrides `.env`.
 */
function loadEnvFiles(): void {
  let dotenv: any;
  try {
    dotenv = require('dotenv');
  } catch {
    // dotenv not installed — skip env file loading
    return;
  }

  const { existsSync } = require('fs');
  const { resolve } = require('path');
  const cwd = process.cwd();

  // Load base .env first (lower priority)
  const baseEnv = resolve(cwd, '.env');
  if (existsSync(baseEnv)) {
    dotenv.config({ path: baseEnv });
  }

  // Load environment-specific .env file (higher priority — overwrites base)
  const env = process.env.BOOT_ENV || process.env.NODE_ENV;
  if (env) {
    const envFile = resolve(cwd, `.env.${env}`);
    if (existsSync(envFile)) {
      dotenv.config({ path: envFile, override: true });
    }
  }
}

/**
 * createApp() — the soul of nestjs-boot.
 *
 * Takes a user's AppModule + a single BootOptions config object,
 * auto-wires infrastructure modules, and returns a ready NestJS app.
 *
 * ```ts
 * const app = await createApp(AppModule, {
 *   database: { connections: { master: { writerUri: '...' } } },
 *   cache: { redis: { url: 'redis://...' } },
 * });
 * await app.listen(3000);
 * ```
 */
/**
 * Build the BootWrappedModule by assembling infrastructure imports
 * based on validated options.
 */
function buildBootModule(
  AppModule: Type<unknown>,
  validated: BootOptions,
): Type<unknown> {
  const imports: DynamicModule[] = [BootConfigModule.register(validated)];

  // W0 modules
  if (validated.database) {
    imports.push(lazyDatabase().register(validated.database));
  }
  if (validated.cache) {
    imports.push(lazyCache().register(validated.cache));
  }
  if (validated.health?.enabled !== false) {
    imports.push(lazyHealth().register(validated));
  }
  if (validated.auth) {
    imports.push(lazyAuth().register(validated.auth));
  }

  // W1 modules
  if (validated.correlation || validated.transport) {
    imports.push(lazyCorrelation().register(validated.correlation));
  }
  if (validated.shutdown) {
    imports.push(lazyShutdown().register(validated.shutdown));
  }
  if (validated.transport) {
    imports.push(lazyTransport().register(validated.transport));
    imports.push(lazyRpc().register());
  }
  if (validated.interServiceAuth) {
    imports.push(lazyInterServiceAuth().register(validated.interServiceAuth));
  }

  // W2 modules
  if (validated.metrics) {
    imports.push(lazyMetrics().register(validated.metrics));
  }
  if (validated.logging) {
    imports.push(lazyLogging().register(validated.logging));
  }
  if (validated.tracing) {
    imports.push(lazyTracing().register(validated.tracing));
  }

  // W3 modules
  if (validated.queue) {
    imports.push(lazyQueue().register(validated.queue));
  }
  if (validated.events) {
    imports.push(lazyEventBus().register(validated.events));
  }

  // PP21: CQRS + Event Sourcing
  if (validated.cqrs) {
    imports.push(lazyCqrs().register(validated.cqrs));
  }

  // PP22: Deploy Lifecycle Hooks
  if (validated.deploy?.enabled !== false) {
    imports.push(lazyDeploy().DeployHooksModule.register(validated.deploy ?? {}));
  }

  // Alert Notifications
  if (validated.alerts) {
    const { AlertModule } = require('./alerts/alert.module');
    imports.push(AlertModule.register(validated.alerts));
  }

  // PP13: API Versioning
  if (validated.versioning) {
    imports.push(lazyVersioning().register(validated.versioning));
  }

  // PP14: Multi-tenancy
  if (validated.tenancy) {
    imports.push(lazyTenancy().register(validated.tenancy));
  }

  // PP17: WebSocket Scaling
  if (validated.websocket) {
    imports.push(lazyWebSocket().register(validated.websocket));
  }

  // PP19: Payment Webhooks
  if (validated.webhooks) {
    const { WebhookModule } = require('./payments/webhook.module');
    imports.push(WebhookModule.register(validated.webhooks));
  }

  // PP20: File Storage
  if (validated.storage) {
    const { StorageModule } = require('./storage/storage.module');
    imports.push(StorageModule.register(validated.storage));
  }

  @Module({ imports: [...imports, AppModule] })
  class BootWrappedModule {}

  return BootWrappedModule;
}

/**
 * Apply global interceptors and filters to the NestJS app.
 */
function applyGlobals(app: INestApplication, validated: BootOptions): void {
  // Interceptors
  if (validated.response?.envelope) {
    app.useGlobalInterceptors(new ResponseInterceptor());
  }
  if (validated.resilience?.timeout) {
    const { Reflector } = require('@nestjs/core');
    const { TimeoutInterceptor } = require('./resilience/timeout.interceptor');
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(new TimeoutInterceptor(reflector, validated.resilience));
  }
  if (validated.metrics) {
    try {
      const { HttpMetricsInterceptor } = require('./metrics/http-metrics.interceptor');
      const httpMetrics = app.get(HttpMetricsInterceptor);
      app.useGlobalInterceptors(httpMetrics);
    } catch {
      // MetricsModule disabled — skip
    }
  }
  if (validated.logging) {
    try {
      const { LoggingInterceptor } = require('./logging/logging.interceptor');
      const loggingInterceptor = app.get(LoggingInterceptor);
      app.useGlobalInterceptors(loggingInterceptor);
    } catch {
      // LoggingModule not available — skip
    }
  }

  // Filters + monitoring hooks
  if (validated.monitoring?.errorReporter) {
    AllExceptionsFilter.errorReporter = validated.monitoring.errorReporter;
    const { BootRpcExceptionFilter } = require('./rpc/rpc-exception.filter');
    BootRpcExceptionFilter.errorReporter = validated.monitoring.errorReporter;
  }
  if (validated.response?.errorHandler !== false) {
    app.useGlobalFilters(new AllExceptionsFilter());
  }
  if (validated.transport) {
    try {
      const { BootRpcExceptionFilter } = require('./rpc/rpc-exception.filter');
      const rpcFilter = app.get(BootRpcExceptionFilter);
      app.useGlobalFilters(rpcFilter);
    } catch {
      // RPC filter not available — skip
    }
  }
}

export async function createApp(
  AppModule: Type<unknown>,
  options: BootOptions,
): Promise<INestApplication> {
  // 0. Load .env files (dotenv) — environment-specific overrides
  loadEnvFiles();

  // 1. Validate options
  const validated = validateBootOptions(options);

  // 2. Init tracing FIRST — OTel SDK must patch before NestFactory imports modules
  if (validated.tracing) {
    lazyInitTracing()(validated.tracing);
  }

  // 2.5. Deploy preStart phase — runs before NestFactory.create
  if (validated.deploy?.enabled !== false && validated.deploy) {
    const { Logger: NestLogger } = require('@nestjs/common');
    const deploy = lazyDeploy();
    const preStartService = new deploy.DeployService();
    const deployContext: import('./deploy/interfaces').DeployContext = {
      phase: 'preStart',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '0.0.0',
      startTime: new Date(),
      logger: new NestLogger('DeployHooks'),
      config: validated,
    };

    // Register built-in preStart hooks
    if (validated.deploy.requiredEnvVars?.length) {
      preStartService.registerHook(new deploy.EnvValidationHook(validated.deploy.requiredEnvVars));
    }

    // Register user-provided hooks for preStart
    if (validated.deploy.hooks) {
      for (const hook of validated.deploy.hooks) {
        if (hook.phase === 'preStart') {
          preStartService.registerHook(hook);
        }
      }
    }

    await preStartService.executePhase('preStart', deployContext);
  }

  // 3. Build infrastructure module
  const BootWrappedModule = buildBootModule(AppModule, validated);

  // 4. Create NestJS app (with DI error enrichment)
  const nestOptions: Record<string, unknown> = {};
  if (validated.logger !== undefined) {
    nestOptions.logger = validated.logger;
  }
  let app: INestApplication;
  try {
    app = await NestFactory.create(BootWrappedModule, nestOptions);
  } catch (error: unknown) {
    if (error instanceof Error) {
      const diInfo = parseDiError(error);
      if (diInfo) {
        const { Logger: NestLogger } = require('@nestjs/common');
        const logger = new NestLogger('nestjs-boot');
        logger.error(formatDiError(diInfo));
      }
    }
    throw error;
  }

  // 5. Enable NestJS API versioning if configured
  if (validated.versioning) {
    const VM = lazyVersioning();
    const nestVersioningType = VM.getNestVersioningType(validated.versioning.type ?? 'uri');
    const versioningConfig: Record<string, unknown> = { type: nestVersioningType };
    if (validated.versioning.defaultVersion) {
      versioningConfig.defaultVersion = validated.versioning.defaultVersion;
    }
    if (validated.versioning.type === 'header' && validated.versioning.header) {
      versioningConfig.header = validated.versioning.header;
    }
    if (validated.versioning.type === 'media-type' && validated.versioning.mediaTypeKey) {
      versioningConfig.key = validated.versioning.mediaTypeKey;
    }
    app.enableVersioning(versioningConfig as any);
  }

  // 6. Dev-mode: scan for circular dependency risks (non-blocking)
  if (process.env.NODE_ENV !== 'production') {
    scanForCircularDepWarnings(app);
  }

  // 7. Set app logger
  if (validated.logging) {
    const { BootLogger } = require('./logging/boot-logger');
    const logger = app.get(BootLogger);
    app.useLogger(logger);
  }

  // 8. Apply global interceptors + filters
  applyGlobals(app, validated);

  // 9. Connect microservice transports
  if (validated.transport) {
    await lazyConnectTransports()(app, validated.transport);
  }

  // 10. Enable shutdown hooks
  if (validated.shutdown !== undefined) {
    app.enableShutdownHooks();
  }

  // 11. Surface NEST_DEBUG hint in dev
  if (process.env.NODE_ENV !== 'production' && !process.env.NEST_DEBUG) {
    const { Logger: NestLogger } = require('@nestjs/common');
    new NestLogger('nestjs-boot').log(
      'TIP: Set NEST_DEBUG=true for detailed dependency resolution logs',
    );
  }

  // 12. Layer enforcement (opt-in)
  if (validated.layers?.enabled) {
    validateLayers(app, validated.layers);
  }

  // 13. Config dump in dev mode
  if (process.env.NODE_ENV !== 'production') {
    logConfigSummary(validated);
  }

  // 14. Swagger/OpenAPI
  if (validated.swagger !== undefined) {
    lazySwagger()(app, validated.swagger, !!validated.auth);
  }

  // 15. Deploy postStart + healthGate phases
  if (validated.deploy?.enabled !== false && validated.deploy) {
    try {
      const deploy = lazyDeploy();
      const deployService = app.get(deploy.DeployService);
      const { Logger: NestLogger } = require('@nestjs/common');
      const deployContext: import('./deploy/interfaces').DeployContext = {
        phase: 'postStart',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '0.0.0',
        startTime: new Date(),
        logger: new NestLogger('DeployHooks'),
        config: validated,
      };

      // Register user-provided hooks for postStart/healthGate
      if (validated.deploy.hooks) {
        for (const hook of validated.deploy.hooks) {
          if (hook.phase !== 'preStart') {
            deployService.registerHook(hook);
          }
        }
      }

      // Register built-in readiness gate if configured
      if (validated.deploy.readinessDelay !== undefined) {
        deployService.registerHook(
          new deploy.ReadinessGateHook({ delayMs: validated.deploy.readinessDelay }),
        );
      }

      await deployService.executePhase('postStart', deployContext);
      await deployService.executePhase('healthGate', { ...deployContext, phase: 'healthGate' });
    } catch {
      // DeployHooksModule not available — skip
    }
  }

  return app;
}

/**
 * Log a sanitized config summary in dev mode.
 * Redacts credentials from URIs.
 */
function logConfigSummary(options: BootOptions): void {
  const { Logger: NestLogger } = require('@nestjs/common');
  const logger = new NestLogger('nestjs-boot');

  const lines: string[] = ['Config summary:'];

  // Database
  if (options.database) {
    const connNames = Object.keys(options.database.connections);
    lines.push(`  Database: ${connNames.length} connection(s) [${connNames.join(', ')}]`);
  } else {
    lines.push('  Database: not configured');
  }

  // Cache
  const hasRedis = !!options.cache?.redis;
  const hasMemcached = !!options.cache?.memcached;
  if (hasRedis || hasMemcached) {
    lines.push(`  Cache: Redis ${hasRedis ? '✓' : '✗'}, Memcached ${hasMemcached ? '✓' : '✗'}`);
  } else {
    lines.push('  Cache: not configured');
  }

  // Auth
  const hasJwt = !!options.auth?.jwt;
  const hasApiKey = !!options.auth?.apiKey;
  if (hasJwt || hasApiKey) {
    lines.push(`  Auth: JWT ${hasJwt ? '✓' : '✗'}, API Key ${hasApiKey ? '✓' : '✗'}`);
  } else {
    lines.push('  Auth: not configured');
  }

  // Transport
  if (options.transport) {
    const transports: string[] = ['HTTP'];
    if (options.transport.grpc) transports.push('gRPC');
    if (options.transport.tcp) transports.push('TCP');
    if (options.transport.nats) transports.push('NATS');
    if (options.transport.rabbitmq) transports.push('RabbitMQ');
    lines.push(`  Transport: ${transports.join(' + ')}`);
  } else {
    lines.push('  Transport: HTTP only');
  }

  // Health
  const healthEnabled = options.health?.enabled !== false;
  const healthPath = options.health?.path || '/health';
  lines.push(`  Health: ${healthEnabled ? healthPath : '✗ disabled'}`);

  // Metrics
  if (options.metrics) {
    const metricsPath = options.metrics.path || '/metrics';
    lines.push(`  Metrics: ${metricsPath}`);
  }

  // Tracing
  if (options.tracing) {
    lines.push(`  Tracing: ${options.tracing.exporter} exporter`);
  }

  // Logging
  if (options.logging) {
    lines.push(`  Logging: pino (level: ${options.logging.level || 'info'})`);
  }

  // Queue
  if (options.queue) {
    lines.push(`  Queue: ${options.queue.driver}`);
  }

  // Events
  if (options.events) {
    lines.push(`  Events: ${options.events.transport}`);
  }

  // Versioning
  if (options.versioning) {
    lines.push(
      `  Versioning: ${options.versioning.type ?? 'uri'} (default v${options.versioning.defaultVersion ?? '1'})`,
    );
  }

  // Tenancy
  if (options.tenancy) {
    lines.push(
      `  Tenancy: ${options.tenancy.strategy} strategy / ${options.tenancy.isolation ?? 'row'} isolation`,
    );
  }

  logger.log(lines.join('\n'));
}
