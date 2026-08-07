import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationRunner } from '../../src/database/migrations/migration.runner';
import type { Migration } from '../../src/database/migrations/migration.interface';
import { MigrationModule } from '../../src/database/migrations/migration.module';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal in-memory mongoose Connection mock */
function buildMockConnection(existingRecords: Array<{ version: string; name: string; appliedAt: Date }> = []) {
  const records = [...existingRecords];

  const collection = {
    find: vi.fn((_filter = {}, _opts = {}) => ({
      toArray: vi.fn(async () => [...records]),
    })),
    insertOne: vi.fn(async (doc: any) => {
      records.push(doc);
    }),
    deleteOne: vi.fn(async ({ version }: { version: string }) => {
      const idx = records.findIndex((r) => r.version === version);
      if (idx !== -1) records.splice(idx, 1);
    }),
  };

  return {
    db: { collection: vi.fn(() => collection) },
    _records: records,
    _collection: collection,
  } as unknown as import('mongoose').Connection & { _records: any[]; _collection: any };
}

function makeMigration(version: string, name: string, upFn?: () => Promise<void>, downFn?: () => Promise<void>): Migration {
  return {
    version,
    name,
    up: upFn ?? vi.fn(async () => {}),
    down: downFn,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MigrationRunner', () => {
  describe('migrate()', () => {
    it('runs all pending migrations in version order', async () => {
      const conn = buildMockConnection();
      const order: string[] = [];

      const migrations: Migration[] = [
        makeMigration('2026-08-07-002', 'add-index', async () => { order.push('002'); }),
        makeMigration('2026-08-07-001', 'create-table', async () => { order.push('001'); }),
      ];

      const runner = new MigrationRunner(conn, migrations);
      const results = await runner.migrate();

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('applied');
      expect(results[1].status).toBe('applied');
      // Should run in version-sorted order (001 before 002)
      expect(order).toEqual(['001', '002']);
    });

    it('skips already-applied migrations', async () => {
      const conn = buildMockConnection([
        { version: '2026-08-07-001', name: 'create-table', appliedAt: new Date() },
      ]);

      const upSpy = vi.fn(async () => {});
      const migrations: Migration[] = [
        makeMigration('2026-08-07-001', 'create-table', upSpy),
        makeMigration('2026-08-07-002', 'add-index', async () => {}),
      ];

      const runner = new MigrationRunner(conn, migrations);
      const results = await runner.migrate();

      // Only the pending one should run
      expect(results).toHaveLength(1);
      expect(results[0].version).toBe('2026-08-07-002');
      expect(results[0].status).toBe('applied');
      expect(upSpy).not.toHaveBeenCalled();
    });

    it('returns empty array when all migrations already applied', async () => {
      const conn = buildMockConnection([
        { version: '2026-08-07-001', name: 'create-table', appliedAt: new Date() },
      ]);
      const runner = new MigrationRunner(conn, [
        makeMigration('2026-08-07-001', 'create-table'),
      ]);
      const results = await runner.migrate();
      expect(results).toHaveLength(0);
    });
  });

  describe('rollback()', () => {
    it('rolls back last applied migration', async () => {
      const conn = buildMockConnection([
        { version: '2026-08-07-001', name: 'create-table', appliedAt: new Date('2026-08-07T00:00:00Z') },
        { version: '2026-08-07-002', name: 'add-index', appliedAt: new Date('2026-08-07T01:00:00Z') },
      ]);

      const downSpy = vi.fn(async () => {});
      const migrations: Migration[] = [
        makeMigration('2026-08-07-001', 'create-table', async () => {}, vi.fn(async () => {})),
        makeMigration('2026-08-07-002', 'add-index', async () => {}, downSpy),
      ];

      const runner = new MigrationRunner(conn, migrations);
      const results = await runner.rollback(1);

      expect(results).toHaveLength(1);
      expect(results[0].version).toBe('2026-08-07-002');
      expect(results[0].status).toBe('rolled_back');
      expect(downSpy).toHaveBeenCalledOnce();
    });

    it('marks as skipped when migration has no down() method', async () => {
      const conn = buildMockConnection([
        { version: '2026-08-07-001', name: 'create-table', appliedAt: new Date() },
      ]);

      const migrations: Migration[] = [
        // No down() method
        makeMigration('2026-08-07-001', 'create-table'),
      ];

      const runner = new MigrationRunner(conn, migrations);
      const results = await runner.rollback(1);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('skipped');
      expect(results[0].error).toMatch(/No down\(\) method/);
    });
  });

  describe('status()', () => {
    it('returns applied + pending status for all registered migrations', async () => {
      const appliedAt = new Date('2026-08-07T10:00:00Z');
      const conn = buildMockConnection([
        { version: '2026-08-07-001', name: 'create-table', appliedAt },
      ]);

      const migrations: Migration[] = [
        makeMigration('2026-08-07-001', 'create-table'),
        makeMigration('2026-08-07-002', 'add-index'),
      ];

      const runner = new MigrationRunner(conn, migrations);
      const statuses = await runner.status();

      expect(statuses).toHaveLength(2);

      const first = statuses.find((s) => s.version === '2026-08-07-001')!;
      expect(first.pending).toBe(false);
      expect(first.appliedAt).toEqual(appliedAt);

      const second = statuses.find((s) => s.version === '2026-08-07-002')!;
      expect(second.pending).toBe(true);
      expect(second.appliedAt).toBeNull();
    });
  });

  describe('MigrationModule.register()', () => {
    it('does not auto-run migrations when autoRun is false (default)', () => {
      const dynamicModule = MigrationModule.register({
        connection: 'master',
        migrations: [makeMigration('2026-08-07-001', 'create-table')],
        autoRun: false,
      });

      expect(dynamicModule.module).toBe(MigrationModule);
      // MIGRATION_RUNNER provider must be present
      const providers = dynamicModule.providers as any[];
      const runnerProvider = providers.find((p) => p.provide === 'MIGRATION_RUNNER');
      expect(runnerProvider).toBeDefined();
    });

    it('auto-run disabled by default (autoRun option not set)', () => {
      const dynamicModule = MigrationModule.register({
        connection: 'master',
        migrations: [],
        // autoRun not specified — should default to false
      });

      // Check that MIGRATION_OPTIONS contains autoRun = undefined (falsy)
      const providers = dynamicModule.providers as any[];
      const optionsProvider = providers.find((p) => p.provide === 'MIGRATION_OPTIONS');
      expect(optionsProvider?.useValue?.autoRun).toBeFalsy();
    });
  });
});
