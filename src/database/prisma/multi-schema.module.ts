import { DynamicModule, Global, Module, OnModuleInit, Inject, Optional, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SchemaRegistry, SchemaRegistryOptions, SCHEMA_REGISTRY, DatabaseSchema } from './schema-registry';
import { PRISMA_SERVICE } from './prisma.module';

export interface MultiSchemaModuleOptions {
  /** Prisma service options */
  url?: string;
  log?: string[];
  /** Schema registry options */
  schemas?: SchemaRegistryOptions;
  /** Auto-create schemas on init. Default: true */
  autoCreateSchemas?: boolean;
}

export const MULTI_SCHEMA_OPTIONS = 'BOOT_MULTI_SCHEMA_OPTIONS';

@Global()
@Module({})
export class MultiSchemaModule implements OnModuleInit {
  private readonly logger = new Logger(MultiSchemaModule.name);

  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    @Inject(SCHEMA_REGISTRY) private readonly registry: SchemaRegistry,
    @Optional() @Inject(MULTI_SCHEMA_OPTIONS) private readonly options?: MultiSchemaModuleOptions,
  ) {}

  static register(options?: MultiSchemaModuleOptions): DynamicModule {
    const registry = new SchemaRegistry(options?.schemas);
    const prismaService = new PrismaService({
      url: options?.url,
      log: options?.log,
    });

    return {
      module: MultiSchemaModule,
      global: true,
      providers: [
        {
          provide: MULTI_SCHEMA_OPTIONS,
          useValue: options ?? {},
        },
        {
          provide: SCHEMA_REGISTRY,
          useValue: registry,
        },
        {
          provide: PRISMA_SERVICE,
          useValue: prismaService,
        },
        {
          provide: PrismaService,
          useExisting: PRISMA_SERVICE,
        },
      ],
      exports: [SCHEMA_REGISTRY, PRISMA_SERVICE, PrismaService],
    };
  }

  async onModuleInit() {
    if (this.options?.autoCreateSchemas !== false) {
      const schemas = this.registry.getSchemas()
        .filter(s => s !== DatabaseSchema.PUBLIC);

      if (schemas.length > 0) {
        try {
          const sql = this.registry.generateCreateSchemasSql();
          await this.prisma.client.$executeRawUnsafe(sql);
          this.logger.log(`Schemas ensured: ${schemas.join(', ')}`);
        } catch (error) {
          // Schema creation may fail in test environments — log but don't crash
          this.logger.warn(`Schema auto-create skipped: ${(error as Error).message}`);
        }
      }
    }

    // Log schema mapping summary
    const mapping = this.registry.getMapping();
    const schemaGroups = new Map<string, number>();
    for (const schema of Object.values(mapping)) {
      schemaGroups.set(schema, (schemaGroups.get(schema) ?? 0) + 1);
    }
    const summary = [...schemaGroups.entries()]
      .map(([s, c]) => `${s}(${c})`)
      .join(', ');
    this.logger.log(`Schema mapping: ${summary}`);
  }
}
