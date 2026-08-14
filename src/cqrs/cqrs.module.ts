import { DynamicModule, Logger, Module } from '@nestjs/common';
import { CqrsOptions } from './interfaces';
import { CommandBus } from './command-bus';
import { EventReplayService } from './event-replay.service';
import { MemoryEventStore } from './adapters/memory-event-store';
import { MemorySnapshotStore } from './adapters/memory-snapshot-store';
import {
  CQRS_OPTIONS,
  CQRS_EVENT_STORE,
  CQRS_SNAPSHOT_STORE,
  CQRS_COMMAND_BUS,
  CQRS_REPLAY_SERVICE,
  CQRS_OUTBOX_PROCESSOR,
} from './constants';

/**
 * CqrsModule — CQRS + Event Sourcing infrastructure for nestjs-boot.
 *
 * Provides:
 * - CommandBus (1:1 command→handler routing)
 * - EventStore (append-only event persistence with optimistic concurrency)
 * - SnapshotStore (optional aggregate state caching)
 * - EventReplayService (rebuild read models from event history)
 * - OutboxProcessor (at-least-once guaranteed event delivery)
 *
 * @example
 * ```ts
 * // In BootOptions:
 * createApp({
 *   cqrs: {
 *     eventStore: 'mongodb',
 *     snapshotStore: 'mongodb',
 *     snapshotFrequency: 100,
 *     outbox: { enabled: true, pollInterval: 1000, maxRetries: 5 },
 *   },
 * });
 *
 * // Or standalone:
 * CqrsModule.register({ eventStore: 'memory' })
 * ```
 */
@Module({})
export class CqrsModule {
  private static readonly logger = new Logger('CqrsModule');

  static register(options: CqrsOptions): DynamicModule {
     
    const providers: any[] = [
      { provide: CQRS_OPTIONS, useValue: options },
      {
        provide: CQRS_COMMAND_BUS,
        useFactory: () => {
          CqrsModule.logger.log('CommandBus initialized');
          return new CommandBus();
        },
      },
      { provide: CommandBus, useExisting: CQRS_COMMAND_BUS },
    ];

    // --- Event Store ---
    if (options.eventStore === 'memory') {
      providers.push({
        provide: CQRS_EVENT_STORE,
        useFactory: () => {
          CqrsModule.logger.log('EventStore: memory (non-persistent)');
          return new MemoryEventStore();
        },
      });
    } else if (options.eventStore === 'mongodb') {
      providers.push({
        provide: CQRS_EVENT_STORE,
        useFactory: (...args: unknown[]) => {
          const connection = args[0];
          if (!connection) {
            CqrsModule.logger.error(
              'MongoDBEventStore requires a database connection. ' +
              'Ensure DatabaseModule is configured with a matching connection name.',
            );
            // Fall back to memory store
            CqrsModule.logger.warn('Falling back to MemoryEventStore');
            return new MemoryEventStore();
          }
          const { MongoDBEventStore } = require('./adapters/mongodb-event-store');
          return new MongoDBEventStore(connection);
        },
        inject: [{ token: `DatabaseConnection_writer_${options.connection ?? 'default'}`, optional: true }],
      });
    }

    // --- Snapshot Store ---
    if (options.snapshotStore === 'memory') {
      providers.push({
        provide: CQRS_SNAPSHOT_STORE,
        useFactory: () => {
          CqrsModule.logger.log('SnapshotStore: memory');
          return new MemorySnapshotStore();
        },
      });
    } else if (options.snapshotStore === 'mongodb') {
      providers.push({
        provide: CQRS_SNAPSHOT_STORE,
        useFactory: (...args: unknown[]) => {
          const connection = args[0];
          if (!connection) {
            CqrsModule.logger.warn('MongoDBSnapshotStore: no connection, falling back to memory');
            return new MemorySnapshotStore();
          }
          const { MongoDBSnapshotStore } = require('./adapters/mongodb-snapshot-store');
          return new MongoDBSnapshotStore(connection);
        },
        inject: [{ token: `DatabaseConnection_writer_${options.connection ?? 'default'}`, optional: true }],
      });
    }

    // --- Replay Service ---
    providers.push({
      provide: CQRS_REPLAY_SERVICE,
      useFactory: (eventStore: unknown) => {
        CqrsModule.logger.log('EventReplayService initialized');
        return new EventReplayService(eventStore as import('./interfaces').EventStore);
      },
      inject: [CQRS_EVENT_STORE],
    });
    providers.push({ provide: EventReplayService, useExisting: CQRS_REPLAY_SERVICE });

    // --- Outbox Processor ---
    if (options.outbox?.enabled) {
      providers.push({
        provide: CQRS_OUTBOX_PROCESSOR,
        useFactory: (...args: unknown[]) => {
          const connection = args[0];
          const eventBus = args[1];
          if (!connection) {
            CqrsModule.logger.error('OutboxProcessor requires a database connection — disabled');
            return null;
          }
          const { OutboxProcessor } = require('./outbox-processor');
          const pollInterval = options.outbox!.pollInterval ?? 1000;
          const maxRetries = options.outbox!.maxRetries ?? 5;
          return new OutboxProcessor(connection, eventBus, pollInterval, maxRetries);
        },
        inject: [
          { token: `DatabaseConnection_writer_${options.connection ?? 'default'}`, optional: true },
          'EVENT_BUS_SERVICE',
        ],
      });
    }

    const exports = [
      CQRS_COMMAND_BUS,
      CommandBus,
      CQRS_EVENT_STORE,
      CQRS_REPLAY_SERVICE,
      EventReplayService,
    ];

    if (options.snapshotStore) {
      exports.push(CQRS_SNAPSHOT_STORE);
    }
    if (options.outbox?.enabled) {
      exports.push(CQRS_OUTBOX_PROCESSOR);
    }

    return {
      module: CqrsModule,
      global: true,
      providers,
      exports,
    };
  }
}
