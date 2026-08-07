import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TenantMiddleware } from '../../src/tenancy/tenant.middleware';
import { TenantGuard, TenantRequired } from '../../src/tenancy/tenant.guard';
import { TenantAwareRepository } from '../../src/tenancy/tenant-aware.repository';
import { TenantContext, getTenantId, runWithTenant } from '../../src/tenancy/tenant-context';
import { DatabaseIsolation } from '../../src/tenancy/strategies/database-isolation';
import { RowIsolation } from '../../src/tenancy/strategies/row-isolation';
import { validateBootOptions } from '../../src/config/validators';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    hostname: 'localhost',
    path: '/',
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('PP14 — Multi-tenancy', () => {
  it('Header extraction: TenantMiddleware reads X-Tenant-ID header and stores in AsyncLocalStorage', () => {
    const middleware = new TenantMiddleware({
      strategy: 'header',
      headerName: 'X-Tenant-ID',
      isolation: 'row',
    });

    const req = makeReq({ headers: { 'x-tenant-id': 'acme' } });
    const res = makeRes();

    return new Promise<void>((resolve) => {
      middleware.use(req, res, () => {
        expect(getTenantId()).toBe('acme');
        resolve();
      });
    });
  });

  it('Subdomain extraction: TenantMiddleware parses tenant from hostname (acme.api.example.com)', () => {
    const middleware = new TenantMiddleware({
      strategy: 'subdomain',
      isolation: 'row',
    });

    const req = makeReq({ hostname: 'acme.api.example.com' });
    const res = makeRes();

    return new Promise<void>((resolve) => {
      middleware.use(req, res, () => {
        expect(getTenantId()).toBe('acme');
        resolve();
      });
    });
  });

  it('Row isolation: TenantAwareRepository.findAll auto-adds tenantId filter', async () => {
    const mockFind = vi.fn().mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve([]) }),
    });
    const model = { find: mockFind, modelName: 'Product' } as any;
    const repo = new TenantAwareRepository(model);

    await runWithTenant('tenant-xyz', async () => {
      await repo.findAll({ category: 'toys' });
    });

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-xyz', category: 'toys' }),
    );
  });

  it('Database isolation: DatabaseIsolation creates a connection per tenant via uriFactory', async () => {
    const uriFactory = vi.fn((id: string) => `mongodb://localhost:27017/${id}`);
    const isolation = new DatabaseIsolation(uriFactory);

    const fakeConn = {};
    const mockMongoose = {
      createConnection: vi.fn().mockReturnValue({
        asPromise: () => Promise.resolve(fakeConn),
      }),
    };

    const conn = await isolation.getConnection('acme', mockMongoose);
    expect(uriFactory).toHaveBeenCalledWith('acme');
    expect(conn).toBe(fakeConn);
    expect(isolation.connectionCount).toBe(1);

    // Second call to same tenant reuses connection (no second factory call)
    await isolation.getConnection('acme', mockMongoose);
    expect(uriFactory).toHaveBeenCalledTimes(1);
  });

  it('TenantContext.getTenantId() returns current tenant within async context', () => {
    const ctx = new TenantContext();
    let captured: string | undefined;

    runWithTenant('globex', () => {
      captured = ctx.getTenantId();
    });

    expect(captured).toBe('globex');
  });

  it('@TenantRequired guard rejects (401) when no tenant context is active', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const guard = new TenantGuard(reflector);
    const ctx = {
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    // No runWithTenant wrap → getTenantId() returns undefined → guard throws
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
