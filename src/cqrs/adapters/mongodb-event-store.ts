import { Logger } from '@nestjs/common';
import type { Connection as MongooseConnection } from 'mongoose';
import { StoredEvent } from '../domain-event';
import { EventStore, ConcurrencyError } from '../interfaces';

/**
 * MongoDB-backed EventStore implementation.
 *
 * Uses a single `event_store` collection with a compound unique index on
 * `{ streamId, version }` to enforce optimistic concurrency.
 *
 * Global ordering is maintained via an auto-incrementing `position` field
 * using a MongoDB counter document in `event_store_counters`.
 *
 * This implementation uses the native MongoDB driver (via Mongoose connection)
 * to stay close to the metal — no Mongoose schemas needed for append-only data.
 */
export class MongoDBEventStore implements EventStore {
  private readonly logger = new Logger('MongoDBEventStore');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private initialized = false;

  /**
   * @param connection - A Mongoose connection instance from DatabaseModule
   */
  constructor(private readonly connection: MongooseConnection) {}

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    this.db = this.connection.db;

    // Compound unique index: prevents duplicate versions per stream
    await this.db.collection('event_store').createIndex(
      { streamId: 1, version: 1 },
      { unique: true },
    );

    // Global position index for ordered replay
    await this.db.collection('event_store').createIndex({ position: 1 });

    // Counter for global position sequencing
    await this.db.collection('event_store_counters').updateOne(
      { _id: 'global_position' },
      { $setOnInsert: { seq: 0 } },
      { upsert: true },
    );

    this.initialized = true;
    this.logger.log('MongoDBEventStore initialized (indexes ensured)');
  }

  async append(streamId: string, events: StoredEvent[], expectedVersion?: number): Promise<void> {
    await this.ensureInitialized();

    if (expectedVersion !== undefined) {
      // Check current stream version for optimistic concurrency
      const latest = await this.db
        .collection('event_store')
        .find({ streamId })
        .sort({ version: -1 })
        .limit(1)
        .toArray();

      const currentVersion = latest.length > 0 ? latest[0].version : 0;

      if (currentVersion !== expectedVersion) {
        throw new ConcurrencyError(streamId, expectedVersion, currentVersion);
      }
    }

    // Get the current stream version to compute new versions
    const latestDoc = await this.db
      .collection('event_store')
      .find({ streamId })
      .sort({ version: -1 })
      .limit(1)
      .toArray();

    let version = latestDoc.length > 0 ? latestDoc[0].version : 0;

    const docs = [];
    for (const event of events) {
      version++;

      // Atomically increment global position counter
      const counter = await this.db
        .collection('event_store_counters')
        .findOneAndUpdate(
          { _id: 'global_position' },
          { $inc: { seq: 1 } },
          { returnDocument: 'after' },
        );

      docs.push({
        streamId,
        version,
        type: event.type,
        data: event.data,
        metadata: {
          correlationId: event.metadata?.correlationId,
          causationId: event.metadata?.causationId,
          timestamp: event.metadata?.timestamp ?? new Date(),
        },
        position: counter.seq ?? counter.value?.seq,
      });
    }

    try {
      await this.db.collection('event_store').insertMany(docs, { ordered: true });
    } catch (err: unknown) {
      // Duplicate key error = concurrent write on same version
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
        throw new ConcurrencyError(streamId, version - events.length, version);
      }
      throw err;
    }
  }

  async getEvents(streamId: string, fromVersion?: number): Promise<StoredEvent[]> {
    await this.ensureInitialized();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = { streamId };
    if (fromVersion !== undefined) {
      filter.version = { $gt: fromVersion };
    }

    return this.db
      .collection('event_store')
      .find(filter)
      .sort({ version: 1 })
      .toArray();
  }

  async getAllEvents(fromPosition?: number): Promise<StoredEvent[]> {
    await this.ensureInitialized();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = {};
    if (fromPosition !== undefined) {
      filter.position = { $gt: fromPosition };
    }

    return this.db
      .collection('event_store')
      .find(filter)
      .sort({ position: 1 })
      .toArray();
  }
}
