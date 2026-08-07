import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrudController } from '../../src/common/crud.controller';
import { CrudService } from '../../src/common/crud.service';
import { Document } from 'mongoose';

// ── Minimal stubs ─────────────────────────────────────────────────────────────

interface FakeDoc extends Document {
  name: string;
}

function makeMockService(): Partial<CrudService<FakeDoc>> {
  return {
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    findById: vi.fn().mockResolvedValue({ _id: '1', name: 'Test' } as unknown as FakeDoc),
    create: vi.fn().mockResolvedValue({ _id: '1', name: 'Created' } as unknown as FakeDoc),
    update: vi.fn().mockResolvedValue({ _id: '1', name: 'Updated' } as unknown as FakeDoc),
    delete: vi.fn().mockResolvedValue({ _id: '1', name: 'Deleted' } as unknown as FakeDoc),
  };
}

// Concrete subclass — simulates what a developer would write
class TestController extends CrudController<FakeDoc> {
  constructor(service: CrudService<FakeDoc>) {
    super(service);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CrudController', () => {
  let mockService: ReturnType<typeof makeMockService>;
  let controller: TestController;

  beforeEach(() => {
    mockService = makeMockService();
    controller = new TestController(mockService as CrudService<FakeDoc>);
  });

  it('findAll() delegates to service.findAll with page/limit from query', async () => {
    const result = await controller.findAll('2', '10');

    expect(mockService.findAll).toHaveBeenCalledWith({}, { page: 2, limit: 10 });
    expect(result).toMatchObject({ data: [], total: 0 });
  });

  it('findAll() uses defaults when page/limit are undefined', async () => {
    await controller.findAll(undefined, undefined);

    expect(mockService.findAll).toHaveBeenCalledWith({}, {});
  });

  it('findById() delegates to service.findById', async () => {
    const result = await controller.findById('abc123');

    expect(mockService.findById).toHaveBeenCalledWith('abc123');
    expect(result).toMatchObject({ name: 'Test' });
  });

  it('create() delegates to service.create with the DTO', async () => {
    const dto = { name: 'New Item' } as Partial<FakeDoc>;
    const result = await controller.create(dto);

    expect(mockService.create).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject({ name: 'Created' });
  });

  it('update() delegates to service.update with id and DTO', async () => {
    const dto = { name: 'Updated Item' } as Partial<FakeDoc>;
    const result = await controller.update('abc123', dto);

    expect(mockService.update).toHaveBeenCalledWith('abc123', dto);
    expect(result).toMatchObject({ name: 'Updated' });
  });

  it('delete() delegates to service.delete', async () => {
    const result = await controller.delete('abc123');

    expect(mockService.delete).toHaveBeenCalledWith('abc123');
    expect(result).toMatchObject({ name: 'Deleted' });
  });

  it('subclass can override delete() to add auth guard behaviour', async () => {
    // Simulate a subclass that wraps delete with admin-only check
    class AdminController extends CrudController<FakeDoc> {
      constructor(service: CrudService<FakeDoc>) { super(service); }

      override async delete(id: string) {
        // Custom logic (auth check, audit log, etc.) before delegating
        if (id === 'forbidden') throw new Error('Forbidden');
        return super.delete(id);
      }
    }

    const adminCtrl = new AdminController(mockService as CrudService<FakeDoc>);

    await expect(adminCtrl.delete('forbidden')).rejects.toThrow('Forbidden');
    await expect(adminCtrl.delete('allowed')).resolves.toMatchObject({ name: 'Deleted' });
  });
});
