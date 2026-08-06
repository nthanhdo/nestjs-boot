import type { Connection } from 'mongoose';

/**
 * Seed a Mongoose database with fixture data.
 *
 * ```ts
 * const ids = await seedDatabase(connection, {
 *   users: [{ name: 'Alice' }, { name: 'Bob' }],
 *   products: [{ title: 'Widget', price: 9.99 }],
 * });
 * // ids.users = ['64a...', '64b...']
 * ```
 *
 * @param connection - Mongoose connection instance
 * @param fixtures - Map of collection names → arrays of documents to insert
 * @returns Map of collection names → arrays of inserted document _id strings
 */
export async function seedDatabase(
  connection: Connection,
  fixtures: Record<string, Record<string, unknown>[]>,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  for (const [collectionName, docs] of Object.entries(fixtures)) {
    if (!docs.length) {
      result[collectionName] = [];
      continue;
    }

    const collection = connection.collection(collectionName);
    const inserted = await collection.insertMany(docs);

    result[collectionName] = Object.values(inserted.insertedIds).map((id) =>
      id.toString(),
    );
  }

  return result;
}
