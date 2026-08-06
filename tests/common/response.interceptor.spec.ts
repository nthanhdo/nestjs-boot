import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

function createMockContext(statusCode = 200) {
  return {
    switchToHttp: () => ({
      getResponse: () => ({ statusCode }),
      getRequest: () => ({}),
    }),
  } as any;
}

function createMockHandler(value: unknown) {
  return { handle: () => of(value) } as any;
}

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  it('wraps plain response into envelope', async () => {
    const ctx = createMockContext(200);
    const handler = createMockHandler({ id: 1, name: 'test' });

    const result = await new Promise((resolve) => {
      interceptor.intercept(ctx, handler).subscribe(resolve);
    });

    expect(result).toEqual({
      statusCode: 200,
      message: 'Success',
      data: { id: 1, name: 'test' },
    });
  });

  it('wraps paginated response with metadata', async () => {
    const ctx = createMockContext(200);
    const handler = createMockHandler({
      data: [{ id: 1 }],
      total: 50,
      page: 2,
      limit: 10,
    });

    const result = await new Promise((resolve) => {
      interceptor.intercept(ctx, handler).subscribe(resolve);
    });

    expect(result).toEqual({
      statusCode: 200,
      message: 'Success',
      data: [{ id: 1 }],
      total: 50,
      page: 2,
      limit: 10,
    });
  });

  it('skips already-enveloped response', async () => {
    const ctx = createMockContext(200);
    const alreadyEnveloped = {
      statusCode: 201,
      message: 'Created',
      data: { id: 1 },
    };
    const handler = createMockHandler(alreadyEnveloped);

    const result = await new Promise((resolve) => {
      interceptor.intercept(ctx, handler).subscribe(resolve);
    });

    expect(result).toEqual(alreadyEnveloped);
  });
});
