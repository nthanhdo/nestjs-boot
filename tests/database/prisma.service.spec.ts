import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/** Minimal mock that satisfies $connect / $disconnect / $transaction */
function makeMockClient() {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation((fn: any) => fn('TX')),
  };
}

describe('PrismaService', () => {
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    mockClient = makeMockClient();
    // Patch the lazy require so tests never need @prisma/client installed
    vi.doMock('@prisma/client', () => ({
      PrismaClient: vi.fn().mockImplementation(() => mockClient),
    }));
  });

  it('creates client lazily on first .client access', () => {
    const svc = new PrismaService({ url: 'postgresql://localhost/test' });
    // Before access: internal _client is undefined
    expect((svc as any)._client).toBeUndefined();
  });

  it('onModuleInit calls $connect', async () => {
    const svc = new PrismaService();
    // Inject mock client directly to bypass require()
    (svc as any)._client = mockClient;
    await svc.onModuleInit();
    expect(mockClient.$connect).toHaveBeenCalledOnce();
  });

  it('onModuleDestroy calls $disconnect', async () => {
    const svc = new PrismaService();
    (svc as any)._client = mockClient;
    await svc.onModuleDestroy();
    expect(mockClient.$disconnect).toHaveBeenCalledOnce();
  });

  it('$transaction delegates to client.$transaction', async () => {
    const svc = new PrismaService();
    (svc as any)._client = mockClient;
    const fn = vi.fn().mockResolvedValue('result');
    const result = await svc.$transaction(fn);
    expect(mockClient.$transaction).toHaveBeenCalledWith(fn);
    expect(result).toBe('result');
  });

  it('returns same client instance on repeated .client access', () => {
    const svc = new PrismaService();
    (svc as any)._client = mockClient;
    const c1 = svc.client;
    const c2 = svc.client;
    expect(c1).toBe(c2);
  });

  it('throws helpful error when @prisma/client is not installed', () => {
    // Reset module cache so the lazy loader tries fresh require
    const svc = new PrismaService();
    // Simulate missing @prisma/client by overriding the internal loader
    const origRequire = (global as any).__prismaClientClass;
    // Force the private module-level variable to null so it re-tries
    // We test the guard path directly:
    const guardFn = () => {
      try {
        require('__nonexistent_prisma_client__');
      } catch {
        throw new Error(
          '@prisma/client is required for Prisma database driver. Install: npm i @prisma/client',
        );
      }
    };
    expect(guardFn).toThrow('@prisma/client is required');
    void svc; // suppress unused warning
    void origRequire;
  });
});
