import type mongoose from 'mongoose';

/**
 * A single database migration.
 *
 * Versions use date-prefixed format ('2026-08-07-001') or semantic ('1.0.0').
 * Migrations are sorted and executed in ascending version order.
 */
export interface Migration {
  /** Unique version string — determines execution order ('2026-08-07-001' or '1.0.0') */
  version: string;
  /** Human-readable name ('add-email-index') */
  name: string;
  /** Apply migration */
  up(db: mongoose.Connection): Promise<void>;
  /** Optional rollback */
  down?(db: mongoose.Connection): Promise<void>;
}

/** Single migration execution result */
export interface MigrationResult {
  version: string;
  name: string;
  status: 'applied' | 'rolled_back' | 'skipped' | 'failed';
  durationMs: number;
  error?: string;
}

/** Migration status entry (for `status` command) */
export interface MigrationStatus {
  version: string;
  name: string;
  appliedAt: Date | null;
  pending: boolean;
}
