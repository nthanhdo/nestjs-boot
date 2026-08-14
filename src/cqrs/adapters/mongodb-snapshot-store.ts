import { Logger } from '@nestjs/common';
import { SnapshotStore } from '../interfaces';

/**
 * MongoDB-backed SnapshotStore.
 *
 * Stores the latest snapshot per aggregate in a `snapshots` collection.
 * Each aggregate has at most one snapshot document (upserted on save).
 */
export class MongoDBSnapshotStore implements SnapshotStore {
  private readonly logger = new Logger('MongoDBSnapshotStore');
   
  private db: any;
  private initialized = false;

   
  constructor(private readonly connection: any) {}

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.db = this.connection.db;
    await this.db.collection('snapshots').createIndex({ streamId: 1 }, { unique: true });
    this.initialized = true;
    this.logger.log('MongoDBSnapshotStore initialized');
  }

  async save(streamId: string, version: number, state: unknown): Promise<void> {
    await this.ensureInitialized();
    await this.db.collection('snapshots').updateOne(
      { streamId },
      { $set: { streamId, version, state, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async load(streamId: string): Promise<{ version: number; state: unknown } | null> {
    await this.ensureInitialized();
    const doc = await this.db.collection('snapshots').findOne({ streamId });
    if (!doc) return null;
    return { version: doc.version, state: doc.state };
  }
}
