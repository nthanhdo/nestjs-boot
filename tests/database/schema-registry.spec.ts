import { describe, it, expect, beforeEach } from 'vitest';
import {
  SchemaRegistry,
  DatabaseSchema,
  DEFAULT_SCHEMA_MAP,
} from '../../src/database/prisma/schema-registry';

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  describe('DEFAULT_SCHEMA_MAP', () => {
    it('contains masterdata entities', () => {
      expect(DEFAULT_SCHEMA_MAP['roles']).toBe(DatabaseSchema.MASTERDATA);
      expect(DEFAULT_SCHEMA_MAP['permissions']).toBe(DatabaseSchema.MASTERDATA);
      expect(DEFAULT_SCHEMA_MAP['role_permissions']).toBe(DatabaseSchema.MASTERDATA);
      expect(DEFAULT_SCHEMA_MAP['role_hierarchy']).toBe(DatabaseSchema.MASTERDATA);
      expect(DEFAULT_SCHEMA_MAP['organizations']).toBe(DatabaseSchema.MASTERDATA);
      expect(DEFAULT_SCHEMA_MAP['departments']).toBe(DatabaseSchema.MASTERDATA);
      expect(DEFAULT_SCHEMA_MAP['teams']).toBe(DatabaseSchema.MASTERDATA);
    });

    it('contains metadata entities', () => {
      expect(DEFAULT_SCHEMA_MAP['permission_definitions']).toBe(DatabaseSchema.METADATA);
      expect(DEFAULT_SCHEMA_MAP['scope_definitions']).toBe(DatabaseSchema.METADATA);
      expect(DEFAULT_SCHEMA_MAP['policy_definitions']).toBe(DatabaseSchema.METADATA);
    });

    it('contains userdata entities', () => {
      expect(DEFAULT_SCHEMA_MAP['users']).toBe(DatabaseSchema.USERDATA);
      expect(DEFAULT_SCHEMA_MAP['user_roles']).toBe(DatabaseSchema.USERDATA);
      expect(DEFAULT_SCHEMA_MAP['user_permissions']).toBe(DatabaseSchema.USERDATA);
      expect(DEFAULT_SCHEMA_MAP['user_org_memberships']).toBe(DatabaseSchema.USERDATA);
      expect(DEFAULT_SCHEMA_MAP['refresh_tokens']).toBe(DatabaseSchema.USERDATA);
      expect(DEFAULT_SCHEMA_MAP['sessions']).toBe(DatabaseSchema.USERDATA);
    });

    it('contains analytics entities', () => {
      expect(DEFAULT_SCHEMA_MAP['audit_entries']).toBe(DatabaseSchema.ANALYTICS);
      expect(DEFAULT_SCHEMA_MAP['security_events']).toBe(DatabaseSchema.ANALYTICS);
      expect(DEFAULT_SCHEMA_MAP['login_attempts']).toBe(DatabaseSchema.ANALYTICS);
    });

    it('contains statistics entities', () => {
      expect(DEFAULT_SCHEMA_MAP['access_stats']).toBe(DatabaseSchema.STATISTICS);
      expect(DEFAULT_SCHEMA_MAP['permission_usage']).toBe(DatabaseSchema.STATISTICS);
      expect(DEFAULT_SCHEMA_MAP['scope_hits']).toBe(DatabaseSchema.STATISTICS);
      expect(DEFAULT_SCHEMA_MAP['policy_evaluations']).toBe(DatabaseSchema.STATISTICS);
    });
  });

  describe('getSchema()', () => {
    it('returns correct schema for known entities', () => {
      expect(registry.getSchema('users')).toBe(DatabaseSchema.USERDATA);
      expect(registry.getSchema('roles')).toBe(DatabaseSchema.MASTERDATA);
      expect(registry.getSchema('audit_entries')).toBe(DatabaseSchema.ANALYTICS);
      expect(registry.getSchema('access_stats')).toBe(DatabaseSchema.STATISTICS);
      expect(registry.getSchema('scope_definitions')).toBe(DatabaseSchema.METADATA);
    });

    it('returns PUBLIC for unknown entities', () => {
      expect(registry.getSchema('unknown_table')).toBe(DatabaseSchema.PUBLIC);
      expect(registry.getSchema('')).toBe(DatabaseSchema.PUBLIC);
      expect(registry.getSchema('some_random_entity')).toBe(DatabaseSchema.PUBLIC);
    });
  });

  describe('setSchema()', () => {
    it('overrides existing entity schema', () => {
      registry.setSchema('users', DatabaseSchema.ANALYTICS);
      expect(registry.getSchema('users')).toBe(DatabaseSchema.ANALYTICS);
    });

    it('adds new entity schema', () => {
      registry.setSchema('custom_table', DatabaseSchema.MASTERDATA);
      expect(registry.getSchema('custom_table')).toBe(DatabaseSchema.MASTERDATA);
    });

    it('accepts string values for schema', () => {
      registry.setSchema('custom_table', 'my_custom_schema');
      expect(registry.getSchema('custom_table')).toBe('my_custom_schema');
    });
  });

  describe('qualifiedName()', () => {
    it('returns schema.table for non-public schemas', () => {
      expect(registry.qualifiedName('users')).toBe('userdata.users');
      expect(registry.qualifiedName('roles')).toBe('masterdata.roles');
      expect(registry.qualifiedName('audit_entries')).toBe('analytics.audit_entries');
      expect(registry.qualifiedName('access_stats')).toBe('statistics.access_stats');
      expect(registry.qualifiedName('scope_definitions')).toBe('metadata.scope_definitions');
    });

    it('returns just the table name for public schema (unknown entity)', () => {
      expect(registry.qualifiedName('unknown_table')).toBe('unknown_table');
    });

    it('returns just the table name when schema is PUBLIC', () => {
      registry.setSchema('my_table', DatabaseSchema.PUBLIC);
      expect(registry.qualifiedName('my_table')).toBe('my_table');
    });
  });

  describe('getEntitiesInSchema()', () => {
    it('returns correct entities for masterdata schema', () => {
      const entities = registry.getEntitiesInSchema(DatabaseSchema.MASTERDATA);
      expect(entities).toContain('roles');
      expect(entities).toContain('permissions');
      expect(entities).toContain('organizations');
      expect(entities).not.toContain('users');
    });

    it('returns correct entities for userdata schema', () => {
      const entities = registry.getEntitiesInSchema(DatabaseSchema.USERDATA);
      expect(entities).toContain('users');
      expect(entities).toContain('sessions');
      expect(entities).not.toContain('roles');
    });

    it('returns empty array for unknown schema', () => {
      const entities = registry.getEntitiesInSchema('nonexistent_schema');
      expect(entities).toEqual([]);
    });

    it('reflects setSchema changes', () => {
      registry.setSchema('users', DatabaseSchema.ANALYTICS);
      const analyticsEntities = registry.getEntitiesInSchema(DatabaseSchema.ANALYTICS);
      expect(analyticsEntities).toContain('users');
      const userdataEntities = registry.getEntitiesInSchema(DatabaseSchema.USERDATA);
      expect(userdataEntities).not.toContain('users');
    });
  });

  describe('getSchemas()', () => {
    it('returns all unique DatabaseSchema values by default', () => {
      const schemas = registry.getSchemas();
      expect(schemas).toContain(DatabaseSchema.MASTERDATA);
      expect(schemas).toContain(DatabaseSchema.METADATA);
      expect(schemas).toContain(DatabaseSchema.USERDATA);
      expect(schemas).toContain(DatabaseSchema.ANALYTICS);
      expect(schemas).toContain(DatabaseSchema.STATISTICS);
      expect(schemas).toContain(DatabaseSchema.PUBLIC);
    });

    it('returns custom schemas when provided via options', () => {
      const custom = new SchemaRegistry({ schemas: ['schema_a', 'schema_b'] });
      const schemas = custom.getSchemas();
      expect(schemas).toContain('schema_a');
      expect(schemas).toContain('schema_b');
      expect(schemas).not.toContain(DatabaseSchema.MASTERDATA);
    });
  });

  describe('constructor overrides', () => {
    it('merges overrides with defaults', () => {
      const custom = new SchemaRegistry({
        overrides: {
          users: DatabaseSchema.ANALYTICS,
          custom_entity: DatabaseSchema.METADATA,
        },
      });
      // Override applied
      expect(custom.getSchema('users')).toBe(DatabaseSchema.ANALYTICS);
      expect(custom.getSchema('custom_entity')).toBe(DatabaseSchema.METADATA);
      // Default still present for other entities
      expect(custom.getSchema('roles')).toBe(DatabaseSchema.MASTERDATA);
    });

    it('works without any options (no crash)', () => {
      const r = new SchemaRegistry();
      expect(r.getSchema('users')).toBe(DatabaseSchema.USERDATA);
    });

    it('works with empty options object', () => {
      const r = new SchemaRegistry({});
      expect(r.getSchema('roles')).toBe(DatabaseSchema.MASTERDATA);
    });
  });

  describe('getMapping()', () => {
    it('returns full mapping as plain object', () => {
      const mapping = registry.getMapping();
      expect(typeof mapping).toBe('object');
      expect(mapping['users']).toBe(DatabaseSchema.USERDATA);
      expect(mapping['roles']).toBe(DatabaseSchema.MASTERDATA);
    });

    it('reflects setSchema changes', () => {
      registry.setSchema('users', 'custom_schema');
      const mapping = registry.getMapping();
      expect(mapping['users']).toBe('custom_schema');
    });
  });

  describe('generateCreateSchemasSql()', () => {
    it('produces CREATE SCHEMA IF NOT EXISTS for each non-public schema', () => {
      const sql = registry.generateCreateSchemasSql();
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "masterdata";');
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "metadata";');
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "userdata";');
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "analytics";');
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "statistics";');
    });

    it('does NOT include public schema', () => {
      const sql = registry.generateCreateSchemasSql();
      expect(sql).not.toContain('"public"');
    });

    it('produces valid SQL lines (each ends with semicolon)', () => {
      const sql = registry.generateCreateSchemasSql();
      const lines = sql.split('\n').filter(l => l.trim().length > 0);
      for (const line of lines) {
        expect(line.trim()).toMatch(/;$/);
      }
    });

    it('uses custom schemas when specified', () => {
      const custom = new SchemaRegistry({ schemas: ['schema_a', 'schema_b'] });
      const sql = custom.generateCreateSchemasSql();
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "schema_a";');
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "schema_b";');
      expect(sql).not.toContain('"masterdata"');
    });
  });

  describe('generatePrismaSchemaMap()', () => {
    it('produces annotation comments for all entities', () => {
      const output = registry.generatePrismaSchemaMap();
      expect(output).toContain('@@schema("masterdata")');
      expect(output).toContain('@@schema("userdata")');
      expect(output).toContain('roles → @@schema("masterdata")');
      expect(output).toContain('users → @@schema("userdata")');
    });

    it('includes header comment with multiSchema preview feature note', () => {
      const output = registry.generatePrismaSchemaMap();
      expect(output).toContain('previewFeatures = ["multiSchema"]');
    });

    it('includes schema list in header', () => {
      const output = registry.generatePrismaSchemaMap();
      expect(output).toContain('Schemas:');
    });
  });
});
