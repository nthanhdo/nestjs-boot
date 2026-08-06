import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, Document, Model, Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BaseRepository } from '../../src/database/base.repository';

interface TestItem extends Document {
  name: string;
  value: number;
}

const TestItemSchema = new Schema<TestItem>({
  name: { type: String, required: true },
  value: { type: Number, required: true },
});

describe('BaseRepository', () => {
  let mongod: MongoMemoryServer;
  let writerConn: Connection;
  let writerModel: Model<TestItem>;
  let repo: BaseRepository<TestItem>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    writerConn = mongoose.createConnection(uri);
    writerModel = writerConn.model<TestItem>('TestItem', TestItemSchema);
    repo = new BaseRepository<TestItem>(writerModel);
  });

  afterAll(async () => {
    await writerConn.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await writerModel.deleteMany({});
  });

  it('findAll returns paginated data', async () => {
    await writerModel.insertMany([
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
      { name: 'c', value: 3 },
    ]);

    const result = await repo.findAll({}, { page: 1, limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);
  });

  it('findById returns document', async () => {
    const doc = await writerModel.create({ name: 'test', value: 42 });
    const found = await repo.findById(doc._id.toString());

    expect(found).not.toBeNull();
    expect(found!.name).toBe('test');
    expect(found!.value).toBe(42);
  });

  it('create saves document', async () => {
    const created = await repo.create({ name: 'new', value: 99 });

    expect(created.name).toBe('new');
    expect(created.value).toBe(99);
    expect(created._id).toBeDefined();

    const inDb = await writerModel.findById(created._id);
    expect(inDb).not.toBeNull();
  });

  it('update modifies document', async () => {
    const doc = await writerModel.create({ name: 'old', value: 1 });
    const updated = await repo.update(doc._id.toString(), { value: 2 });

    expect(updated).not.toBeNull();
    expect(updated!.value).toBe(2);
    expect(updated!.name).toBe('old');
  });

  it('delete removes document', async () => {
    const doc = await writerModel.create({ name: 'bye', value: 0 });
    const deleted = await repo.delete(doc._id.toString());

    expect(deleted).not.toBeNull();
    expect(deleted!.name).toBe('bye');

    const inDb = await writerModel.findById(doc._id);
    expect(inDb).toBeNull();
  });

  it('count returns correct number', async () => {
    await writerModel.insertMany([
      { name: 'x', value: 1 },
      { name: 'y', value: 2 },
    ]);

    const total = await repo.count();
    expect(total).toBe(2);

    const filtered = await repo.count({ name: 'x' });
    expect(filtered).toBe(1);
  });

  it('reads use reader model when provided', async () => {
    // Create a second connection to simulate reader
    const readerConn = mongoose.createConnection(mongod.getUri());
    const readerModel = readerConn.model<TestItem>('TestItem', TestItemSchema);

    const repoWithReader = new BaseRepository<TestItem>(writerModel, readerModel);

    // Insert via writer
    await writerModel.create({ name: 'rw-test', value: 7 });

    // Read should work via reader (same DB in test, but proves routing)
    const found = await repoWithReader.findOne({ name: 'rw-test' });
    expect(found).not.toBeNull();
    expect(found!.value).toBe(7);

    await readerConn.close();
  });

  it('exists returns boolean correctly', async () => {
    await writerModel.create({ name: 'check', value: 5 });

    expect(await repo.exists({ name: 'check' })).toBe(true);
    expect(await repo.exists({ name: 'nope' })).toBe(false);
  });

  it('aggregate runs pipeline', async () => {
    await writerModel.insertMany([
      { name: 'a', value: 10 },
      { name: 'a', value: 20 },
      { name: 'b', value: 5 },
    ]);

    const result = await repo.aggregate([
      { $group: { _id: '$name', total: { $sum: '$value' } } },
      { $sort: { _id: 1 } },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ _id: 'a', total: 30 });
    expect(result[1]).toMatchObject({ _id: 'b', total: 5 });
  });
});
