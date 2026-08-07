import type mongoose from 'mongoose';
import { Migration, MigrationResult, MigrationStatus } from './migration.interface';

/** Document shape stored in `_migrations` collection */
interface MigrationRecord {
  version: string;
  name: string;
  appliedAt: Date;
}

const COLLECTION = '_migrations';

/**
 * MigrationRunner — executes pending migrations and tracks applied ones in `_migrations`.
 *
 * Works like Django's migration framework or Laravel's Artisan:
 * - Maintains a `_migrations` collection that records which versions have run.
 * - `migrate()` runs only pending migrations in version order.
 * - `rollback(n)` reverts the last N applied migrations (requires `down()`).
 * - `status()` compares registered migrations against applied records.
 */
export class MigrationRunner {
  constructor(
    private readonly connection: mongoose.Connection,
    private readonly migrations: Migration[],
  ) {}

  private get collection() {
    return this.connection.db!.collection<MigrationRecord>(COLLECTION);
  }

  /** Fetch all applied versions from the tracking collection */
  private async appliedVersions(): Promise<Set<string>> {
    const records = await this.collection.find({}, { projection: { version: 1 } }).toArray();
    return new Set(records.map((r) => r.version));
  }

  /** Sorted migrations (ascending version) */
  private sorted(): Migration[] {
    return [...this.migrations].sort((a, b) => a.version.localeCompare(b.version));
  }

  /**
   * Run all pending (not-yet-applied) migrations.
   * Already-applied versions are skipped.
   */
  async migrate(): Promise<MigrationResult[]> {
    const applied = await this.appliedVersions();
    const pending = this.sorted().filter((m) => !applied.has(m.version));

    const results: MigrationResult[] = [];
    for (const migration of pending) {
      const start = Date.now();
      try {
        await migration.up(this.connection);
        await this.collection.insertOne({
          version: migration.version,
          name: migration.name,
          appliedAt: new Date(),
        });
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'applied',
          durationMs: Date.now() - start,
        });
      } catch (err) {
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'failed',
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
        // Stop on first failure — later migrations may depend on this one
        break;
      }
    }
    return results;
  }

  /**
   * Rollback the last `count` applied migrations (default: 1).
   * Only migrations that implement `down()` can be rolled back.
   */
  async rollback(count = 1): Promise<MigrationResult[]> {
    const applied = await this.appliedVersions();
    // Reverse order — roll back newest first
    const toRollback = this.sorted()
      .filter((m) => applied.has(m.version))
      .reverse()
      .slice(0, count);

    const results: MigrationResult[] = [];
    for (const migration of toRollback) {
      const start = Date.now();
      if (!migration.down) {
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'skipped',
          durationMs: 0,
          error: 'No down() method defined',
        });
        continue;
      }
      try {
        await migration.down(this.connection);
        await this.collection.deleteOne({ version: migration.version });
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'rolled_back',
          durationMs: Date.now() - start,
        });
      } catch (err) {
        results.push({
          version: migration.version,
          name: migration.name,
          status: 'failed',
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }
    return results;
  }

  /**
   * Return the status of all registered migrations (applied vs. pending).
   */
  async status(): Promise<MigrationStatus[]> {
    const records = await this.collection.find({}).toArray();
    const recordMap = new Map(records.map((r) => [r.version, r.appliedAt]));

    return this.sorted().map((m) => ({
      version: m.version,
      name: m.name,
      appliedAt: recordMap.get(m.version) ?? null,
      pending: !recordMap.has(m.version),
    }));
  }
}
