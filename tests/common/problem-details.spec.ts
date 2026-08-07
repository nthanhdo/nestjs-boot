import { HttpStatus, NotFoundException } from '@nestjs/common';
import { toProblemDetails, DEFAULT_PROBLEM_BASE_URI } from '../../src/common/problem-details';
import { BootException } from '../../src/common/boot-exception';
import { ErrorCodes } from '../../src/common/error-codes';

describe('toProblemDetails', () => {
  it('maps a BootException to a valid RFC 7807 Problem Details object', () => {
    const ex = new BootException('Order not found', {
      code: ErrorCodes.DB_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });

    const pd = toProblemDetails(ex, '/api/orders/123');

    expect(pd.type).toContain(ErrorCodes.DB_NOT_FOUND);
    expect(pd.title).toBe('Not Found');
    expect(pd.status).toBe(404);
    expect(pd.detail).toBe('Order not found');
    expect(pd.instance).toBe('/api/orders/123');
    expect(pd.code).toBe(ErrorCodes.DB_NOT_FOUND);
  });

  it('maps a plain HttpException (no code) to type = base URI', () => {
    const ex = new NotFoundException('User not found');

    const pd = toProblemDetails(ex, '/api/users/99');

    expect(pd.type).toBe(DEFAULT_PROBLEM_BASE_URI);
    expect(pd.title).toBe('Not Found');
    expect(pd.status).toBe(404);
    expect(pd.detail).toBe('User not found');
    expect(pd.instance).toBe('/api/users/99');
    expect(pd.code).toBeUndefined();
  });

  it('uses a custom baseUri when provided', () => {
    const ex = new BootException('Token expired', {
      code: ErrorCodes.AUTH_TOKEN_EXPIRED,
      status: HttpStatus.UNAUTHORIZED,
    });

    const pd = toProblemDetails(ex, '/api/me', 'https://docs.myapp.com/errors');

    expect(pd.type).toBe(`https://docs.myapp.com/errors#${ErrorCodes.AUTH_TOKEN_EXPIRED}`);
    expect(pd.status).toBe(401);
  });

  it('includes validation details in extension fields for BootException with details', () => {
    const ex = new BootException('Validation failed', {
      code: ErrorCodes.DB_VALIDATION_FAILED,
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      details: [{ field: 'email', message: 'email is required' }],
    });

    const pd = toProblemDetails(ex);

    expect(pd.status).toBe(422);
    expect(pd.details).toHaveLength(1);
    expect((pd.details as Array<{ field: string }>)[0].field).toBe('email');
  });
});
