import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaBaseRepository } from '../../src/database/prisma/prisma-base.repository';

interface FakeUser {
  id: string;
  name: string;
  email: string;
}

/** Build a mock Prisma model delegate */
function makeModelMock() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  };
}

function makeRepo() {
  const modelMock = makeModelMock();

  const prismaMock = {
    client: { user: modelMock },
    $transaction: vi.fn().mockImplementation((fn: any) => fn('TX')),
  } as unknown as PrismaService;

  const repo = new PrismaBaseRepository<FakeUser>(prismaMock, 'user');
  return { repo, modelMock, prismaMock };
}

describe('PrismaBaseRepository', () => {
  let repo: PrismaBaseRepository<FakeUser>;
  let model: ReturnType<typeof makeModelMock>;

  beforeEach(() => {
    const built = makeRepo();
    repo = built.repo;
    model = built.modelMock;
  });

  // ── findById ─────────────────────────────────────────────────────────────

  it('findById calls findUnique with id where clause', async () => {
    const user: FakeUser = { id: '1', name: 'Alice', email: 'alice@example.com' };
    model.findUnique.mockResolvedValue(user);

    const result = await repo.findById('1');

    expect(model.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
    expect(result).toEqual(user);
  });

  it('findById returns null when not found', async () => {
    model.findUnique.mockResolvedValue(null);
    const result = await repo.findById('missing');
    expect(result).toBeNull();
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  it('findOne calls findFirst with where clause', async () => {
    const user: FakeUser = { id: '2', name: 'Bob', email: 'bob@example.com' };
    model.findFirst.mockResolvedValue(user);

    const result = await repo.findOne({ email: 'bob@example.com' });

    expect(model.findFirst).toHaveBeenCalledWith({ where: { email: 'bob@example.com' } });
    expect(result).toEqual(user);
  });

  // ── findMany ──────────────────────────────────────────────────────────────

  it('findMany passes where and options to model', async () => {
    const users: FakeUser[] = [
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      { id: '2', name: 'Bob', email: 'bob@example.com' },
    ];
    model.findMany.mockResolvedValue(users);

    const result = await repo.findMany({ name: 'Alice' }, { take: 10 });

    expect(model.findMany).toHaveBeenCalledWith({ where: { name: 'Alice' }, take: 10 });
    expect(result).toHaveLength(2);
  });

  it('findMany works with no arguments', async () => {
    model.findMany.mockResolvedValue([]);
    const result = await repo.findMany();
    expect(model.findMany).toHaveBeenCalledWith({ where: undefined });
    expect(result).toEqual([]);
  });

  // ── findWithPagination ────────────────────────────────────────────────────

  it('findWithPagination returns correct page metadata', async () => {
    const users: FakeUser[] = [
      { id: '1', name: 'Alice', email: 'a@example.com' },
      { id: '2', name: 'Bob', email: 'b@example.com' },
    ];
    model.findMany.mockResolvedValue(users);
    model.count.mockResolvedValue(25);

    const result = await repo.findWithPagination({}, { page: 2, limit: 10 });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.data).toEqual(users);
    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('findWithPagination uses defaults when no options provided', async () => {
    model.findMany.mockResolvedValue([]);
    model.count.mockResolvedValue(0);

    const result = await repo.findWithPagination({}, {});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(0);
  });

  // ── create ────────────────────────────────────────────────────────────────

  it('create passes data to model.create', async () => {
    const created: FakeUser = { id: '3', name: 'Carol', email: 'c@example.com' };
    model.create.mockResolvedValue(created);

    const result = await repo.create({ name: 'Carol', email: 'c@example.com' });

    expect(model.create).toHaveBeenCalledWith({ data: { name: 'Carol', email: 'c@example.com' } });
    expect(result).toEqual(created);
  });

  // ── createMany ────────────────────────────────────────────────────────────

  it('createMany returns count', async () => {
    model.createMany.mockResolvedValue({ count: 3 });
    const data = [
      { name: 'A', email: 'a@example.com' },
      { name: 'B', email: 'b@example.com' },
      { name: 'C', email: 'c@example.com' },
    ];
    const result = await repo.createMany(data);
    expect(model.createMany).toHaveBeenCalledWith({ data });
    expect(result.count).toBe(3);
  });

  // ── update ────────────────────────────────────────────────────────────────

  it('update calls model.update with id and data', async () => {
    const updated: FakeUser = { id: '1', name: 'Alice Updated', email: 'a@example.com' };
    model.update.mockResolvedValue(updated);

    const result = await repo.update('1', { name: 'Alice Updated' });

    expect(model.update).toHaveBeenCalledWith({ where: { id: '1' }, data: { name: 'Alice Updated' } });
    expect(result).toEqual(updated);
  });

  // ── updateMany ────────────────────────────────────────────────────────────

  it('updateMany returns count', async () => {
    model.updateMany.mockResolvedValue({ count: 5 });
    const result = await repo.updateMany({ name: 'Bob' }, { name: 'Robert' });
    expect(model.updateMany).toHaveBeenCalledWith({ where: { name: 'Bob' }, data: { name: 'Robert' } });
    expect(result.count).toBe(5);
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it('delete calls model.delete with id', async () => {
    const deleted: FakeUser = { id: '1', name: 'Alice', email: 'a@example.com' };
    model.delete.mockResolvedValue(deleted);

    const result = await repo.delete('1');

    expect(model.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    expect(result).toEqual(deleted);
  });

  // ── deleteMany ────────────────────────────────────────────────────────────

  it('deleteMany returns count', async () => {
    model.deleteMany.mockResolvedValue({ count: 2 });
    const result = await repo.deleteMany({ name: 'Alice' });
    expect(model.deleteMany).toHaveBeenCalledWith({ where: { name: 'Alice' } });
    expect(result.count).toBe(2);
  });

  // ── count ─────────────────────────────────────────────────────────────────

  it('count returns number', async () => {
    model.count.mockResolvedValue(42);
    const result = await repo.count({ name: 'Alice' });
    expect(model.count).toHaveBeenCalledWith({ where: { name: 'Alice' } });
    expect(result).toBe(42);
  });

  it('count works with no arguments', async () => {
    model.count.mockResolvedValue(100);
    const result = await repo.count();
    expect(model.count).toHaveBeenCalledWith({ where: undefined });
    expect(result).toBe(100);
  });

  // ── exists ────────────────────────────────────────────────────────────────

  it('exists returns true when count > 0', async () => {
    model.count.mockResolvedValue(1);
    const result = await repo.exists({ email: 'alice@example.com' });
    expect(result).toBe(true);
  });

  it('exists returns false when count === 0', async () => {
    model.count.mockResolvedValue(0);
    const result = await repo.exists({ email: 'nobody@example.com' });
    expect(result).toBe(false);
  });

  // ── upsert ────────────────────────────────────────────────────────────────

  it('upsert calls model.upsert with where/create/update', async () => {
    const upserted: FakeUser = { id: '1', name: 'Alice', email: 'alice@example.com' };
    model.upsert.mockResolvedValue(upserted);

    const result = await repo.upsert(
      { email: 'alice@example.com' },
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Alice' },
    );

    expect(model.upsert).toHaveBeenCalledWith({
      where: { email: 'alice@example.com' },
      create: { name: 'Alice', email: 'alice@example.com' },
      update: { name: 'Alice' },
    });
    expect(result).toEqual(upserted);
  });

  // ── withTransaction ───────────────────────────────────────────────────────

  it('withTransaction delegates to prisma.$transaction', async () => {
    const { repo: r, prismaMock } = makeRepo();
    const fn = vi.fn().mockResolvedValue('tx-result');
    const result = await r.withTransaction(fn);
    expect((prismaMock as any).$transaction).toHaveBeenCalledWith(fn);
    expect(result).toBe('tx-result');
  });
});
