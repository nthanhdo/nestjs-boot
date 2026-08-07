import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpException, BadRequestException, NotFoundException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { BootRpcExceptionFilter, RpcErrorEnvelope } from '../../src/rpc/rpc-exception.filter';
import { deserializeRpcError } from '../../src/rpc/rpc-error.deserializer';
import { GrpcStatus } from '../../src/rpc/grpc-status-map';
import { runWithCorrelationId } from '../../src/correlation/correlation.storage';

describe('BootRpcExceptionFilter', () => {
  let filter: BootRpcExceptionFilter;

  beforeEach(() => {
    filter = new BootRpcExceptionFilter({ serviceName: 'test-service' });
  });

  it('catches a generic Error and serializes to 500 envelope', () => {
    const error = new Error('something broke');
    const envelope = filter.buildEnvelope(error);

    expect(envelope.statusCode).toBe(500);
    expect(envelope.message).toBe('something broke');
    expect(envelope.error).toBe('InternalServerError');
    expect(envelope.service).toBe('test-service');
    expect(envelope.timestamp).toBeDefined();
  });

  it('catches HttpException and preserves status + message', () => {
    const error = new BadRequestException('invalid input');
    const envelope = filter.buildEnvelope(error);

    expect(envelope.statusCode).toBe(400);
    expect(envelope.message).toBe('invalid input');
    expect(envelope.error).toBe('Bad Request');
  });

  it('catches an RpcException-like object and extracts error info', () => {
    const rpcEx = {
      getError: () => ({
        statusCode: 404,
        message: 'Order not found',
        error: 'NotFound',
      }),
      message: 'Order not found',
    };

    const envelope = filter.buildEnvelope(rpcEx);

    expect(envelope.statusCode).toBe(404);
    expect(envelope.message).toBe('Order not found');
    expect(envelope.error).toBe('NotFound');
  });

  it('includes correlationId when available in AsyncLocalStorage', () => {
    const envelope = runWithCorrelationId('req-123', () =>
      filter.buildEnvelope(new Error('fail')),
    );

    expect(envelope.correlationId).toBe('req-123');
  });

  it('omits correlationId when not in ALS context', () => {
    const envelope = filter.buildEnvelope(new Error('fail'));
    expect(envelope.correlationId).toBeUndefined();
  });

  it('catch() returns an Observable that errors with the envelope', async () => {
    const error = new NotFoundException('item missing');
    const obs = filter.catch(error, {} as unknown);

    await expect(firstValueFrom(obs)).rejects.toMatchObject({
      statusCode: 404,
      message: 'item missing',
    });
  });

  it('maps envelope to gRPC error via static toGrpcError()', () => {
    const envelope: RpcErrorEnvelope = {
      statusCode: 400,
      message: 'bad',
      error: 'BadRequest',
      timestamp: new Date().toISOString(),
    };

    const grpcError = BootRpcExceptionFilter.toGrpcError(envelope);

    expect(grpcError.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    expect(grpcError.message).toBe('bad');
    expect(JSON.parse(grpcError.details)).toMatchObject({ statusCode: 400 });
  });

  it('handles unknown exception types gracefully', () => {
    const envelope = filter.buildEnvelope('just a string');

    expect(envelope.statusCode).toBe(500);
    expect(envelope.message).toBe('Internal Server Error');
  });

  describe('errorReporter', () => {
    afterEach(() => {
      BootRpcExceptionFilter.errorReporter = undefined;
    });

    it('calls errorReporter when set and exception is an Error', () => {
      const reporter = vi.fn();
      BootRpcExceptionFilter.errorReporter = reporter;

      const error = new Error('rpc fail');
      filter.catch(error, {} as unknown);

      expect(reporter).toHaveBeenCalledTimes(1);
      expect(reporter).toHaveBeenCalledWith(error, {
        statusCode: 500,
        service: 'test-service',
        contextType: 'rpc',
      });
    });
  });
});

describe('deserializeRpcError', () => {
  it('converts RpcErrorEnvelope back to HttpException', () => {
    const envelope: RpcErrorEnvelope = {
      statusCode: 404,
      message: 'Not found',
      error: 'NotFound',
      correlationId: 'req-456',
      timestamp: new Date().toISOString(),
    };

    const httpEx = deserializeRpcError(envelope);

    expect(httpEx).toBeInstanceOf(HttpException);
    expect(httpEx.getStatus()).toBe(404);
    const response = httpEx.getResponse() as Record<string, unknown>;
    expect(response.message).toBe('Not found');
    expect(response.correlationId).toBe('req-456');
  });

  it('passes through existing HttpException unchanged', () => {
    const original = new BadRequestException('already http');
    const result = deserializeRpcError(original);
    expect(result).toBe(original);
  });

  it('converts gRPC-style error with code field', () => {
    const grpcErr = {
      code: GrpcStatus.NOT_FOUND,
      message: 'not found via grpc',
    };

    const httpEx = deserializeRpcError(grpcErr);
    expect(httpEx.getStatus()).toBe(404);
  });

  it('parses gRPC details JSON back to original envelope', () => {
    const originalEnvelope: RpcErrorEnvelope = {
      statusCode: 403,
      message: 'forbidden',
      error: 'Forbidden',
      correlationId: 'abc',
      timestamp: new Date().toISOString(),
    };

    const grpcErr = {
      code: GrpcStatus.PERMISSION_DENIED,
      message: 'forbidden',
      details: JSON.stringify(originalEnvelope),
    };

    const httpEx = deserializeRpcError(grpcErr);
    expect(httpEx.getStatus()).toBe(403);
    const resp = httpEx.getResponse() as Record<string, unknown>;
    expect(resp.correlationId).toBe('abc');
  });

  it('handles completely unknown error shapes', () => {
    const httpEx = deserializeRpcError(42);
    expect(httpEx.getStatus()).toBe(500);
  });
});
