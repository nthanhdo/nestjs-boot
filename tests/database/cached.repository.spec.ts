import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CachedBaseRepository } from '../../src/database/cached.repository';
import { MultiCacheService } from '../../src/cache/multi-cache.service';
import { MemoryCacheAdapter } from '../../src/cache/adapters/memory-cache.adapter';

// Minimal Mongoose model mock
function createMockModel(collectionName: string) {
  const model: any = vi.fn();
  model.collection = { collectionName };
  model.find = vi.fn().mockReturnValue({
    skip: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([{ _id: '1', name: 'test' }]),
      }),
    }),
  });
  model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(1) });
  model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: '1', name: 'test' }) });
  model.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: '1', name: 'test' }) });
  model.findByIdAndUpdate = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: '1', name: 'updated' }) });
  model.findByIdAndDelete = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: '1' }) });
  model.deleteMany = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) });
  model.updateMany = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });
  model.insertMany = vi.fn().mockResolvedValue([{ _id: '2' }]);
  model.exists = vi.fn().mockResolvedValue({ _id: '1' });
  model.aggregate = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([{ count: 1 }]) });

  // Constructor for create()
  const docInstance = { save: vi.fn().mockResolvedValue({ _id: '2', name: 'new' }) };
  const ModelConstructor: any = function () { return docInstance; };
  Object.assign(ModelConstructor, model);
  ModelConstructor.prototype = {};
  // Copy mock methods
  for (const key of Object.keys(model)) {
    ModelConstructor[key] = model[key];
  }
  return ModelConstructor;
}

describe('CachedBaseRepository', () => {
  let cacheService: MultiCacheService;
  let repo: CachedBaseRepository<any>;
  let writerModel: any;

  beforeEach(() => {
    const l1 = new MemoryCacheAdapter(100);
    cacheService = new MultiCacheService(l1, null, 300);
    writerModel = createMockModel('products');
    repo = new CachedBaseRepository(writerModel, undefined, cacheService, 60);
  });

  it('should cache read results (findById)', async () => {
    const result1 = await repo.findById('1');
    expect(result1).toEqual({ _id: '1', name: 'test' });

    // Second call should hit cache — model.findById should still be called only once
    const callCount = writerModel.findById.mock.calls.length;
    const result2 = await repo.findById('1');
    expect(result2).toEqual({ _id: '1', name: 'test' });
    expect(writerModel.findById.mock.calls.length).toBe(callCount); // no additional DB call
  });

  it('should fall through to DB on cache miss', async () => {
    // First call — cache miss, hits DB
    const result = await repo.findById('1');
    expect(result).toEqual({ _id: '1', name: 'test' });
    expect(writerModel.findById).toHaveBeenCalled();
  });

  it('should invalidate cache on write (create)', async () => {
    // Populate cache
    await repo.findById('1');

    // Write — should invalidate
    await repo.update('1', { name: 'updated' });

    // Reset mock call count to detect fresh DB call
    writerModel.findById.mockClear();
    writerModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ _id: '1', name: 'updated' }),
    });

    // Should miss cache and hit DB again
    await repo.findById('1');
    expect(writerModel.findById).toHaveBeenCalled();
  });

  it('should use collection name as cache prefix for deletion', async () => {
    const delSpy = vi.spyOn(cacheService, 'delByPrefix');

    await repo.update('1', { name: 'x' });
    expect(delSpy).toHaveBeenCalledWith('products');
  });
});
