import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Schema, Connection, Document, Model } from 'mongoose';
import { CrudService } from '../../src/common/crud.service';

// Test schema
interface TestDoc extends Document {
  name: string;
  isActive: boolean;
}

const TestSchema = new Schema({
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Concrete implementation for testing
class TestService extends CrudService<TestDoc> {
  public beforeCreateSpy = vi.fn();
  public afterCreateSpy = vi.fn();
  public beforeUpdateSpy = vi.fn();
  public afterUpdateSpy = vi.fn();
  public beforeDeleteSpy = vi.fn();
  public afterDeleteSpy = vi.fn();

  constructor(model: Model<TestDoc>) {
    super(model);
  }

  protected async beforeCreate(data: Partial<TestDoc>): Promise<Partial<TestDoc>> {
    this.beforeCreateSpy(data);
    return data;
  }

  protected async afterCreate(doc: TestDoc): Promise<void> {
    this.afterCreateSpy(doc);
  }

  protected async beforeUpdate(id: string, data: Partial<TestDoc>): Promise<Partial<TestDoc>> {
    this.beforeUpdateSpy(id, data);
    return data;
  }

  protected async afterUpdate(doc: TestDoc): Promise<void> {
    this.afterUpdateSpy(doc);
  }

  protected async beforeDelete(id: string): Promise<void> {
    this.beforeDeleteSpy(id);
  }

  protected async afterDelete(doc: TestDoc): Promise<void> {
    this.afterDeleteSpy(doc);
  }
}

describe('CrudService', () => {
  let mongoServer: any;
  let connection: Connection;
  let model: Model<TestDoc>;
  let service: TestService;

  beforeAll(async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongoose = await import('mongoose');

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    connection = mongoose.connection;
    model = mongoose.model<TestDoc>('CrudTest', TestSchema);
    service = new TestService(model);
  });

  beforeEach(async () => {
    await model.deleteMany({});
    service.beforeCreateSpy.mockClear();
    service.afterCreateSpy.mockClear();
    service.beforeUpdateSpy.mockClear();
    service.afterUpdateSpy.mockClear();
    service.beforeDeleteSpy.mockClear();
    service.afterDeleteSpy.mockClear();
  });

  afterAll(async () => {
    const mongoose = await import('mongoose');
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should create a document and call hooks', async () => {
    const result = await service.create({ name: 'Test', isActive: true } as Partial<TestDoc>);
    expect(result.name).toBe('Test');
    expect(result._id).toBeDefined();
    expect(service.beforeCreateSpy).toHaveBeenCalledOnce();
    expect(service.afterCreateSpy).toHaveBeenCalledOnce();
  });

  it('should find by id', async () => {
    const created = await service.create({ name: 'FindMe' } as Partial<TestDoc>);
    const found = await service.findById(created._id.toString());
    expect(found).not.toBeNull();
    expect(found!.name).toBe('FindMe');
  });

  it('should findAll with pagination', async () => {
    for (let i = 0; i < 15; i++) {
      await service.create({ name: `Item ${i}` } as Partial<TestDoc>);
    }
    const page1 = await service.findAll({}, { page: 1, limit: 10 });
    expect(page1.data).toHaveLength(10);
    expect(page1.total).toBe(15);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(10);

    const page2 = await service.findAll({}, { page: 2, limit: 10 });
    expect(page2.data).toHaveLength(5);
  });

  it('should update and call hooks', async () => {
    const doc = await service.create({ name: 'Original' } as Partial<TestDoc>);
    const updated = await service.update(doc._id.toString(), { name: 'Updated' } as Partial<TestDoc>);
    expect(updated!.name).toBe('Updated');
    expect(service.beforeUpdateSpy).toHaveBeenCalledOnce();
    expect(service.afterUpdateSpy).toHaveBeenCalledOnce();
  });

  it('should delete and call hooks', async () => {
    const doc = await service.create({ name: 'ToDelete' } as Partial<TestDoc>);
    const deleted = await service.delete(doc._id.toString());
    expect(deleted!.name).toBe('ToDelete');
    expect(service.beforeDeleteSpy).toHaveBeenCalledOnce();
    expect(service.afterDeleteSpy).toHaveBeenCalledOnce();

    const notFound = await service.findById(doc._id.toString());
    expect(notFound).toBeNull();
  });

  it('should count documents', async () => {
    await service.create({ name: 'A' } as Partial<TestDoc>);
    await service.create({ name: 'B' } as Partial<TestDoc>);
    const count = await service.count();
    expect(count).toBe(2);
  });

  it('should check existence', async () => {
    await service.create({ name: 'Exists' } as Partial<TestDoc>);
    expect(await service.exists({ name: 'Exists' } as any)).toBe(true);
    expect(await service.exists({ name: 'Nope' } as any)).toBe(false);
  });

  it('should findOne by filter', async () => {
    await service.create({ name: 'Unique', isActive: false } as Partial<TestDoc>);
    const found = await service.findOne({ isActive: false } as any);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Unique');
  });

  it('should cap limit at 100', async () => {
    const result = await service.findAll({}, { limit: 500 });
    expect(result.limit).toBe(100);
  });
});
