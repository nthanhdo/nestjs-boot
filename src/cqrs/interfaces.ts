import { StoredEvent } from './domain-event';

/**
 * EventStore interface — the persistence layer for domain events.
 *
 * Implementations: MongoDBEventStore (default), MemoryEventStore (testing).
 * Users can implement this for EventStoreDB, Kafka, DynamoDB, etc.
 */
export interface EventStore {
  /**
   * Append events to a stream with optimistic concurrency control.
   *
   * @param streamId - Aggregate/stream identifier
   * @param events - Domain events to append (in order)
   * @param expectedVersion - If provided, append fails when stream version !== expectedVersion
   *   (prevents concurrent writes from corrupting aggregate state)
   * @throws ConcurrencyError when expectedVersion doesn't match
   */
  append(streamId: string, events: StoredEvent[], expectedVersion?: number): Promise<void>;

  /**
   * Read events for a single stream, optionally from a specific version.
   */
  getEvents(streamId: string, fromVersion?: number): Promise<StoredEvent[]>;

  /**
   * Read ALL events across all streams in global position order.
   * Used for projection replay.
   */
  getAllEvents(fromPosition?: number): Promise<StoredEvent[]>;
}

/**
 * SnapshotStore interface — optional optimization for aggregate replay.
 *
 * Snapshots store the full state of an aggregate at a point in time,
 * so replay only needs to process events AFTER the snapshot version.
 */
export interface SnapshotStore {
  /**
   * Save a snapshot of aggregate state at a specific version.
   */
  save(streamId: string, version: number, state: unknown): Promise<void>;

  /**
   * Load the latest snapshot for a stream.
   * Returns null if no snapshot exists.
   */
  load(streamId: string): Promise<{ version: number; state: unknown } | null>;
}

/**
 * Concurrency conflict error — thrown by EventStore.append()
 * when expectedVersion doesn't match the current stream version.
 */
export class ConcurrencyError extends Error {
  constructor(streamId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Concurrency conflict on stream "${streamId}": ` +
      `expected version ${expectedVersion}, but stream is at version ${actualVersion}`,
    );
    this.name = 'ConcurrencyError';
  }
}

/**
 * Configuration for the CqrsModule.
 */
export interface CqrsOptions {
  /**
   * Event store backend.
   * - 'mongodb': uses existing DatabaseModule connection (default)
   * - 'memory': in-memory store (testing/dev only — data lost on restart)
   */
  eventStore: 'mongodb' | 'memory';

  /**
   * Snapshot store backend. Omit to disable snapshots.
   */
  snapshotStore?: 'mongodb' | 'memory';

  /**
   * Take a snapshot every N events per aggregate.
   * Only applies when snapshotStore is configured.
   * @default 100
   */
  snapshotFrequency?: number;

  /**
   * Outbox pattern configuration for guaranteed event delivery.
   */
  outbox?: {
    enabled: boolean;
    /** Poll interval in ms for outbox processor @default 1000 */
    pollInterval?: number;
    /** Max retries before dead-lettering @default 5 */
    maxRetries?: number;
  };

  /**
   * Which DatabaseModule connection name to use for MongoDB stores.
   * Defaults to the first available connection.
   */
  connection?: string;
}
