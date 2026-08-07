import { describe, it, expect, vi } from 'vitest';
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

function createMockHost(url = '/test') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    host: {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ url }),
        getResponse: () => ({ status }),
      }),
    } as any,
    json,
    status,
  };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('handles HttpException', () => {
    const { host, status, json } = createMockHost('/api/users');
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('Not Found');
    expect(body.path).toBe('/api/users');
    expect(body.timestamp).toBeDefined();
  });

  it('handles ValidationPipe errors with details array', () => {
    const { host, status, json } = createMockHost('/api/users');
    const exception = new BadRequestException({
      message: ['name must be a string', 'email must be valid'],
      error: 'Bad Request',
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual(['name must be a string', 'email must be valid']);
    expect(body.error).toBe('Bad Request');
  });

  it('handles unknown errors as 500', () => {
    const { host, status, json } = createMockHost('/api/crash');

    filter.catch('something broke', host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal Server Error');
    expect(body.error).toBe('InternalServerError');
  });
});
