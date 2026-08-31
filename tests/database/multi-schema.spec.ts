import { describe, it, expect } from 'vitest';
import { MultiSchemaModule, MULTI_SCHEMA_OPTIONS } from '../../src/database/prisma/multi-schema.module';
import { SCHEMA_REGISTRY } from '../../src/database/prisma/schema-registry';
import { PRISMA_SERVICE } from '../../src/database/prisma/prisma.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { SchemaRegistry, DatabaseSchema } from '../../src/database/prisma/schema-registry';

describe('MultiSchemaModule', () => {
  describe('register()', () => {
    it('returns a DynamicModule with the correct module reference', () => {
      const mod = MultiSchemaModule.register();
      expect(mod.module).toBe(MultiSchemaModule);
    });

    it('is marked global', () => {
      const mod = MultiSchemaModule.register();
      expect(mod.global).toBe(true);
    });

    it('provides SCHEMA_REGISTRY token', () => {
      const mod = MultiSchemaModule.register();
      const providers = mod.providers as any[];
      const registryProvider = providers.find(p => p.provide === SCHEMA_REGISTRY);
      expect(registryProvider).toBeDefined();
      expect(registryProvider.useValue).toBeInstanceOf(SchemaRegistry);
    });

    it('provides PRISMA_SERVICE token', () => {
      const mod = MultiSchemaModule.register();
      const providers = mod.providers as any[];
      const prismaProvider = providers.find(p => p.provide === PRISMA_SERVICE);
      expect(prismaProvider).toBeDefined();
      expect(prismaProvider.useValue).toBeInstanceOf(PrismaService);
    });

    it('provides PrismaService via useExisting alias', () => {
      const mod = MultiSchemaModule.register();
      const providers = mod.providers as any[];
      const aliasProvider = providers.find(p => p.provide === PrismaService);
      expect(aliasProvider).toBeDefined();
      expect(aliasProvider.useExisting).toBe(PRISMA_SERVICE);
    });

    it('provides MULTI_SCHEMA_OPTIONS token', () => {
      const mod = MultiSchemaModule.register();
      const providers = mod.providers as any[];
      const optionsProvider = providers.find(p => p.provide === MULTI_SCHEMA_OPTIONS);
      expect(optionsProvider).toBeDefined();
    });

    it('exports SCHEMA_REGISTRY, PRISMA_SERVICE, and PrismaService', () => {
      const mod = MultiSchemaModule.register();
      expect(mod.exports).toContain(SCHEMA_REGISTRY);
      expect(mod.exports).toContain(PRISMA_SERVICE);
      expect(mod.exports).toContain(PrismaService);
    });

    it('works with no options (no crash)', () => {
      expect(() => MultiSchemaModule.register()).not.toThrow();
    });

    it('works with empty options object (no crash)', () => {
      expect(() => MultiSchemaModule.register({})).not.toThrow();
    });

    it('passes options through to MULTI_SCHEMA_OPTIONS provider', () => {
      const options = { url: 'postgresql://localhost/test', autoCreateSchemas: false };
      const mod = MultiSchemaModule.register(options);
      const providers = mod.providers as any[];
      const optionsProvider = providers.find(p => p.provide === MULTI_SCHEMA_OPTIONS);
      expect(optionsProvider.useValue).toBe(options);
    });

    it('passes schema overrides to SchemaRegistry', () => {
      const mod = MultiSchemaModule.register({
        schemas: {
          overrides: {
            custom_table: DatabaseSchema.ANALYTICS,
          },
        },
      });
      const providers = mod.providers as any[];
      const registryProvider = providers.find(p => p.provide === SCHEMA_REGISTRY);
      const registry: SchemaRegistry = registryProvider.useValue;
      expect(registry.getSchema('custom_table')).toBe(DatabaseSchema.ANALYTICS);
    });

    it('SchemaRegistry retains default mapping when no overrides', () => {
      const mod = MultiSchemaModule.register();
      const providers = mod.providers as any[];
      const registryProvider = providers.find(p => p.provide === SCHEMA_REGISTRY);
      const registry: SchemaRegistry = registryProvider.useValue;
      expect(registry.getSchema('users')).toBe(DatabaseSchema.USERDATA);
      expect(registry.getSchema('roles')).toBe(DatabaseSchema.MASTERDATA);
    });

    it('uses empty object as fallback for MULTI_SCHEMA_OPTIONS when no options given', () => {
      const mod = MultiSchemaModule.register();
      const providers = mod.providers as any[];
      const optionsProvider = providers.find(p => p.provide === MULTI_SCHEMA_OPTIONS);
      expect(optionsProvider.useValue).toEqual({});
    });
  });
});
