export { PrismaService } from './prisma.service';
export { PrismaBaseRepository } from './prisma-base.repository';
export type {
  PrismaPaginationOptions,
  PrismaPaginatedResult,
  // legacy aliases
  PaginationOptions,
  PaginatedResult,
} from './prisma-base.repository';
export { PrismaModule, PRISMA_SERVICE } from './prisma.module';
export type { PrismaModuleOptions } from './prisma.module';
export { SchemaRegistry, DatabaseSchema, DEFAULT_SCHEMA_MAP, SCHEMA_REGISTRY } from './schema-registry';
export type { SchemaRegistryOptions } from './schema-registry';
export { MultiSchemaModule, MULTI_SCHEMA_OPTIONS } from './multi-schema.module';
export type { MultiSchemaModuleOptions } from './multi-schema.module';
