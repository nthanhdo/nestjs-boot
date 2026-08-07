export { DatabaseModule } from './database.module';
export type { ModelDefinition } from './database.module';
export { BaseRepository } from './base.repository';
export type { PaginatedResult, FindAllOptions } from './base.repository';
export { InjectConnection } from './decorators';
export {
  DATABASE_CONNECTION_PREFIX,
  getWriterToken,
  getReaderToken,
  getWriterConnectionName,
  getReaderConnectionName,
} from './constants';
export { createConnectionModules } from './connection.factory';
export { CachedBaseRepository } from './cached.repository';
export { UnitOfWork, UNIT_OF_WORK_CONNECTION } from './unit-of-work';
export { Specification, AndSpecification, OrSpecification, NotSpecification } from './specification';

// Migration system
export { MigrationModule } from './migrations/migration.module';
export type { MigrationModuleOptions } from './migrations/migration.module';
export { MigrationRunner } from './migrations/migration.runner';
export type { Migration, MigrationResult, MigrationStatus } from './migrations/migration.interface';
