import { HttpStatus } from '@nestjs/common';
import { errorBoundary, errorBoundarySync } from '../../src/common/error-boundary';
import { BootException } from '../../src/common/boot-exception';

describe('errorBoundary', () => {
  it('returns the resolved value when the operation succeeds', async () => {
    const result = await errorBoundary(() => Promise.resolve(42), {
      code: 'TEST_ERROR',
    });
    expect(result).toBe(42);
  });

  it('throws a BootException with the given code when the operation fails', async () => {
    await expect(
      errorBoundary(() => Promise.reject(new Error('downstream timeout')), {
        code: 'ORDER_FETCH_FAILED',
        status: HttpStatus.SERVICE_UNAVAILABLE,
      }),
    ).rejects.toMatchObject({
      code: 'ORDER_FETCH_FAILED',
      message: expect.stringContaining('downstream timeout'),
    });
  });

  it('returns fallback instead of throwing when fallback is provided', async () => {
    const result = await errorBoundary(
      () => Promise.reject(new Error('cache miss')),
      { code: 'CACHE_MISS', fallback: null },
    );
    expect(result).toBeNull();
  });

  it('preserves an already-wrapped BootException with its original code', async () => {
    const original = new BootException('Already wrapped', {
      code: 'ORIGINAL_CODE',
      status: 409,
    });

    await expect(
      errorBoundary(() => Promise.reject(original), {
        code: 'OUTER_CODE',
        status: 500,
      }),
    ).rejects.toMatchObject({
      code: 'ORIGINAL_CODE',
    });
  });
});

describe('errorBoundarySync', () => {
  it('returns the value when the sync operation succeeds', () => {
    const result = errorBoundarySync(() => JSON.parse('{"ok":true}'), {
      code: 'PARSE_FAILED',
      fallback: null,
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns fallback for sync failures', () => {
    const result = errorBoundarySync(() => JSON.parse('not-json'), {
      code: 'PARSE_FAILED',
      fallback: null,
    });
    expect(result).toBeNull();
  });
});
