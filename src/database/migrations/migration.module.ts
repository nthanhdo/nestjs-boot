import { DynamicModule, Module, OnModuleInit, Inject } from '@nestjs/common';
import type mongoose from 'mongoose';
import { Migration } from './migration.interface';
import { MigrationRunner } from './migration.runner';
import { getWriterToken } from '../constants';

const MIGRATION_OPTIONS = 'MIGRATION_OPTIONS';

export interface MigrationModuleOptions {
  /** Named database connection to run migrations on (must match DatabaseModule.register key) */
  connection: string;
  /** Migration instances to register */
  migrations: Migration[];
  /**
   * Auto-run pending migrations on app start (default: false).
   * Explicit is safer — recommended to run via CLI or a dedicated init script.
   */
  autoRun?: boolean;
}

/**
 * MigrationModule — config-driven Mongoose migration system.
 *
 * ```ts
 * MigrationModule.register({
 *   connection: 'master',
 *   migrations: [myMigration],
 *   autoRun: false,
 * })
 * ```
 *
 * Then use the CLI:
 * ```bash
 * npx nestjs-boot migrate
 * npx nestjs-boot migrate:rollback
 * npx nestjs-boot migrate:status
 * npx nestjs-boot migrate:create add-email-index
 * ```
 */
@Module({})
export class MigrationModule implements OnModuleInit {
  constructor(
    @Inject(MIGRATION_OPTIONS) private readonly options: MigrationModuleOptions,
    @Inject('MIGRATION_RUNNER') private readonly runner: MigrationRunner,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.options.autoRun) {
      await this.runner.migrate();
    }
  }

  static register(options: MigrationModuleOptions): DynamicModule {
    const connectionToken = getWriterToken(options.connection);

    const runnerProvider = {
      provide: 'MIGRATION_RUNNER',
      useFactory: (conn: mongoose.Connection) =>
        new MigrationRunner(conn, options.migrations),
      inject: [connectionToken],
    };

    const optionsProvider = {
      provide: MIGRATION_OPTIONS,
      useValue: options,
    };

    return {
      module: MigrationModule,
      providers: [optionsProvider, runnerProvider],
      exports: ['MIGRATION_RUNNER'],
    };
  }
}
