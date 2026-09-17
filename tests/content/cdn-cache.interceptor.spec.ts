import { describe, it, expect, vi } from 'vitest';
import { CdnCacheInterceptor } from '../../src/content/interceptors/cdn-cache.interceptor';
import { of, lastValueFrom } from 'rxjs';

describe('CdnCacheInterceptor', () => {
  const interceptor = new CdnCacheInterceptor({
    cdn: { enabled: true, defaultMaxAge: 300, assetMaxAge: 86400, staleWhileRevalidate: 60 },
  } as any);

  function createMockContext(url: string, headers: Record<string, string> = {}) {
    const response = {
      setHeader: vi.fn(),
      status: vi.fn(),
    };
    return {
      context: {
        switchToHttp: () => ({
          getRequest: () => ({ url, headers }),
          getResponse: () => response,
        }),
      } as any,
      response,
    };
  }

  function createMockHandler(data: any) {
    return { handle: () => of(data) } as any;
  }

  it('should set Cache-Control header for entry responses', async () => {
    const { context, response } = createMockContext('/api/delivery/entries');
    await lastValueFrom(interceptor.intercept(context, createMockHandler({ id: '1', updatedAt: new Date().toISOString() })));
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  });

  it('should set longer Cache-Control for assets', async () => {
    const { context, response } = createMockContext('/api/delivery/assets/123');
    await lastValueFrom(interceptor.intercept(context, createMockHandler({ id: '123', filename: 'test.jpg' })));
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400, stale-while-revalidate=60');
  });

  it('should set ETag header', async () => {
    const { context, response } = createMockContext('/api/delivery/entries/1');
    await lastValueFrom(interceptor.intercept(context, createMockHandler({ id: '1', data: { title: 'Test' } })));
    expect(response.setHeader).toHaveBeenCalledWith('ETag', expect.stringMatching(/^"[a-f0-9]{32}"$/));
  });

  it('should set Last-Modified from updatedAt', async () => {
    const { context, response } = createMockContext('/api/delivery/entries/1');
    await lastValueFrom(interceptor.intercept(context, createMockHandler({ id: '1', updatedAt: '2026-09-17T12:00:00Z' })));
    expect(response.setHeader).toHaveBeenCalledWith('Last-Modified', expect.any(String));
  });

  it('should return 304 when ETag matches If-None-Match', async () => {
    const data = { id: '1', title: 'Test' };
    const { createHash } = require('crypto');
    const etag = `"${createHash('md5').update(JSON.stringify(data)).digest('hex')}"`;

    const { context, response } = createMockContext('/api/delivery/entries/1', { 'if-none-match': etag });
    await lastValueFrom(interceptor.intercept(context, createMockHandler(data)));
    expect(response.status).toHaveBeenCalledWith(304);
  });

  it('should set Vary header', async () => {
    const { context, response } = createMockContext('/api/delivery/entries');
    await lastValueFrom(interceptor.intercept(context, createMockHandler({ data: [] })));
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'X-API-Key, Accept-Language');
  });

  it('should set medium TTL for content types', async () => {
    const { context, response } = createMockContext('/api/delivery/types');
    await lastValueFrom(interceptor.intercept(context, createMockHandler([{ id: '1', name: 'Blog' }])));
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600, stale-while-revalidate=60');
  });

  it('should not crash on null response data', async () => {
    const { context, response } = createMockContext('/api/delivery/entries/1');
    await lastValueFrom(interceptor.intercept(context, createMockHandler(null)));
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
