import { describe, it, expect } from 'vitest';
import { lastValueFrom, of, throwError } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import {
  ErrorContextInterceptor,
  BootRpcException,
} from '../../src/transport/error-context.interceptor';
import { runWithCorrelationId } from '../../src/correlation/correlation.storage';

function makeContext(): ExecutionContext {
  return {
    getType: () => 'rpc',
    switchToHttp: () => ({ getResponse: () => ({}) }),
    switchToRpc: () => ({}),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown, throws = false): CallHandler {
  return {
    handle: () => (throws ? throwError(() => value) : of(value)),
  };
}

describe('ErrorContextInterceptor', () => {
  it('passes through successful responses unchanged', async () => {
    const interceptor = new ErrorContextInterceptor({ serviceName: 'api-gateway' });
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeHandler({ ok: true })),
    );
    expect(result).toEqual({ ok: true });
  });

  it('converts RPC error envelope to BootRpcException with service + correlationId', async () => {
    const interceptor = new ErrorContextInterceptor({ serviceName: 'api-gateway' });

    const rpcError = {
      message: 'Order not found',
      code: 'ORDER_NOT_FOUND',
      status: 404,
    };

    let caught: unknown;
    await runWithCorrelationId('corr-xyz', async () => {
      await lastValueFrom(
        interceptor.intercept(makeContext(), makeHandler(rpcError, true)),
      ).catch((err) => {
        caught = err;
      });
    });

    expect(caught).toBeInstanceOf(BootRpcException);
    const ex = caught as BootRpcException;
    expect(ex.code).toBe('ORDER_NOT_FOUND');
    expect(ex.message).toBe('Order not found');
    expect(ex.context.correlationId).toBe('corr-xyz');
    expect(ex.context.upstreamChain).toContain('api-gateway');
  });

  it('extends upstream chain when BootRpcException passes through multiple hops', async () => {
    const hop1 = new ErrorContextInterceptor({ serviceName: 'order-service' });
    const hop2 = new ErrorContextInterceptor({ serviceName: 'api-gateway' });

    // Simulate an error already enriched by order-service
    const firstHopError = new BootRpcException('Inventory depleted', 'STOCK_EMPTY', {
      service: 'inventory-service',
      correlationId: 'corr-abc',
      upstreamChain: ['inventory-service', 'order-service'],
    });

    let caught: unknown;
    await lastValueFrom(
      hop2.intercept(makeContext(), makeHandler(firstHopError, true)),
    ).catch((err) => {
      caught = err;
    });

    const ex = caught as BootRpcException;
    expect(ex).toBeInstanceOf(BootRpcException);
    expect(ex.context.upstreamChain).toContain('order-service');
    expect(ex.context.upstreamChain).toContain('api-gateway');
    expect(ex.context.correlationId).toBe('corr-abc');
  });
});
