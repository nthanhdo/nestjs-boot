import type { Connection } from 'mongoose';

/**
 * Drop all collections in a Mongoose connection.
 * Use in `beforeEach` or `afterEach` for test isolation.
 *
 * ```ts
 * afterEach(async () => {
 *   await cleanDatabase(connection);
 * });
 * ```
 */
export async function cleanDatabase(connection: Connection): Promise<void> {
  const db = connection.db;
  if (!db) {
    throw new Error('[nestjs-boot] cleanDatabase: connection.db is undefined — is the connection open?');
  }

  const collections = await db.listCollections().toArray();

  await Promise.all(
    collections.map((col) => db.dropCollection(col.name)),
  );
}
