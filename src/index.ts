// ============================================================
// nestjs-boot — Root barrel export
//
// Foundation-only: config, common, createApp, DI utils, interfaces.
// Module-specific exports live in subpath imports:
//   import { BaseRepository } from 'nestjs-boot/database'
//   import { AuthModule } from 'nestjs-boot/auth'
//   import { TracingModule } from 'nestjs-boot/tracing'
//   etc.
// ============================================================

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
  PrismaCrudService,
} from './common';
export type { ResponseEnvelope, ErrorResponse, BootExceptionOptions, CrudPaginatedResult, CrudFindAllOptions, PrismaCrudPaginatedResult, PrismaCrudFindAllOptions } from './common';

// --- Database (shared interface only — use nestjs-boot/database for implementations) ---
export type { IRepository, PaginationOptions, PaginatedResult } from './database/repository.interface';

// --- createApp ---
export { createApp, lazyImport } from './create-app';

// --- Plugin System ---
export type { BootPlugin } from './plugin';
export { PluginRegistry } from './plugin';

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

// --- Re-exports for single-bundle DI consistency ---
// Eagerly import to ensure CJS bundle includes these in module.exports
import { PrismaService as _PrismaService } from './database/prisma/prisma.service';
import { BootJwtService as _BootJwtService } from './auth/services/jwt.service';
import { Public as _Public, Roles as _Roles, CurrentUser as _CurrentUser } from './auth/decorators';
export const PrismaService = _PrismaService;
export const BootJwtService = _BootJwtService;
export const Public = _Public;
export const Roles = _Roles;
export const CurrentUser = _CurrentUser;
export type { RoleDefinition } from './auth/rbac/role-hierarchy';
