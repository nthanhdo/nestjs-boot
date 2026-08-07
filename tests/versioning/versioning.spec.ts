import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { VersioningModule } from '../../src/versioning/versioning.module';
import { VersionInterceptor } from '../../src/versioning/version.interceptor';
import { ApiVersion, DeprecatedVersion } from '../../src/versioning/decorators';
import { DEPRECATED_VERSION_KEY } from '../../src/versioning/constants';
import { validateBootOptions } from '../../src/config/validators';
import { of } from 'rxjs';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeContext(overrides: {
  path?: string;
  headers?: Record<string, string>;
  handlerMeta?: unknown;
  classMeta?: unknown;
} = {}): ExecutionContext {
  const request = {
    path: overrides.path ?? '/v1/products',
    url: overrides.path ?? '/v1/products',
    headers: overrides.headers ?? {},
  };
  const response = { set: vi.fn() };

  const reflector = new Reflector();
  // Patch getAllAndOverride to return test metadata
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(
    overrides.handlerMeta ?? overrides.classMeta ?? undefined,
  );

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('PP13 — API Versioning', () => {
  it('URI versioning: extracts version from /v2/... path and sets X-API-Version header', async () => {
    const interceptor = new VersionInterceptor(new Reflector(), {
      type: 'uri',
      defaultVersion: '1',
    });
    const response = { set: vi.fn() };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/v2/products', url: '/v2/products', headers: {} }),
        getResponse: () => response,
      }),
      getHandler: () => () => {},
      getClass: () => class {},
    } as unknown as ExecutionContext;

    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    (interceptor as any).reflector = reflector;

    const next = { handle: () => of(null) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, next as any).subscribe(() => resolve());
    });

    expect(response.set).toHaveBeenCalledWith('X-API-Version', '2');
  });

  it('Header versioning: reads X-API-Version request header', async () => {
    const interceptor = new VersionInterceptor(new Reflector(), {
      type: 'header',
      header: 'X-API-Version',
      defaultVersion: '1',
    });
    const response = { set: vi.fn() };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          path: '/products',
          headers: { 'x-api-version': '3' },
        }),
        getResponse: () => response,
      }),
      getHandler: () => () => {},
      getClass: () => class {},
    } as unknown as ExecutionContext;

    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    (interceptor as any).reflector = reflector;

    const next = { handle: () => of(null) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, next as any).subscribe(() => resolve());
    });

    expect(response.set).toHaveBeenCalledWith('X-API-Version', '3');
  });

  it('Deprecated version: adds Sunset + Deprecation headers when @DeprecatedVersion is set', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('2026-12-31');

    const interceptor = new VersionInterceptor(reflector, { type: 'uri', defaultVersion: '1' });
    const response = { set: vi.fn() };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/v1/products', headers: {} }),
        getResponse: () => response,
      }),
      getHandler: () => function deprecatedHandler() {},
      getClass: () => class ProductsV1Controller {},
    } as unknown as ExecutionContext;

    const next = { handle: () => of(null) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, next as any).subscribe(() => resolve());
    });

    expect(response.set).toHaveBeenCalledWith('Sunset', '2026-12-31');
    expect(response.set).toHaveBeenCalledWith('Deprecation', 'true');
  });

  it('Default version: falls back to defaultVersion when no version in URI', async () => {
    const interceptor = new VersionInterceptor(new Reflector(), {
      type: 'uri',
      defaultVersion: '1',
    });
    const response = { set: vi.fn() };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/products', url: '/products', headers: {} }),
        getResponse: () => response,
      }),
      getHandler: () => () => {},
      getClass: () => class {},
    } as unknown as ExecutionContext;

    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    (interceptor as any).reflector = reflector;

    const next = { handle: () => of(null) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, next as any).subscribe(() => resolve());
    });

    expect(response.set).toHaveBeenCalledWith('X-API-Version', '1');
  });

  it('validateBootOptions accepts versioning config and applies defaults', () => {
    const result = validateBootOptions({ versioning: { type: 'header' } } as any);
    expect((result as any).versioning.type).toBe('header');
    expect((result as any).versioning.defaultVersion).toBe('1');
    expect((result as any).versioning.header).toBe('X-API-Version');
  });
});
