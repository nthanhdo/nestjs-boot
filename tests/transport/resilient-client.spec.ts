import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { createResilientClient } from '../../src/transport/resilient-client';
import { CircuitBreakerOpenError } from '../../src/resilience/circuit-breaker';

interface SampleService {
  getUser(data: { id: string }): { id: string; name: string };
  createOrder(data: { item: string }): { orderId: string };
}

function makeProxy(impl: (method: string, data: unknown) => unknown) {
  return {
    send: vi.fn((method: string, data: unknown) => {
      try {
        return of(impl(method, data));
      } catch (err) {
        return throwError(() => err);
      }
    }),
  };
}

describe('ResilientClient', () => {
  it('returns result on success (no resilience options)', async () => {
    const proxy = makeProxy(() => ({ id: '1', name: 'Alice' }));
    const client = createResilientClient<SampleService>(proxy, {});

    const result = await client.call('getUser', { id: '1' });

    expect(result).toEqual({ id: '1', name: 'Alice' });
    expect(proxy.send).toHaveBeenCalledOnce();
  });

  it('retries on failure and succeeds on 2nd attempt', async () => {
    let attempts = 0;
    const proxy = makeProxy(() => {
      attempts++;
      if (attempts < 2) throw new Error('transient');
      return { id: '2', name: 'Bob' };
    });

    const client = createResilientClient<SampleService>(proxy, {
      retry: { maxAttempts: 3, backoff: 'fixed', delay: 1 },
    });

    const result = await client.call('getUser', { id: '2' });

    expect(result).toEqual({ id: '2', name: 'Bob' });
    expect(attempts).toBe(2);
  });

  it('exhausts all retry attempts and throws', async () => {
    const proxy = makeProxy(() => {
      throw new Error('permanent failure');
    });

    const client = createResilientClient<SampleService>(proxy, {
      retry: { maxAttempts: 3, backoff: 'fixed', delay: 1 },
    });

    await expect(client.call('getUser', { id: '3' })).rejects.toThrow('permanent failure');
    expect(proxy.send).toHaveBeenCalledTimes(3);
  });

  it('times out when downstream is slow', async () => {
    // Return an Observable that never emits
    const { Observable } = await import('rxjs');
    const proxy = {
      send: vi.fn(() => new Observable<never>(() => { /* never emits */ })),
    };

    const client = createResilientClient<SampleService>(proxy as any, {
      timeout: 50,
    });

    await expect(client.call('getUser', { id: '4' })).rejects.toThrow(/timed out/i);
  }, 2000);

  it('opens circuit after failureThreshold and fails fast', async () => {
    let callCount = 0;
    const proxy = makeProxy(() => {
      callCount++;
      throw new Error('downstream down');
    });

    const client = createResilientClient<SampleService>(proxy, {
      circuitBreaker: { failureThreshold: 3, resetTimeout: 60_000 },
      retry: { maxAttempts: 1 },
    });

    // Exhaust the failure threshold
    for (let i = 0; i < 3; i++) {
      await expect(client.call('getUser', { id: String(i) })).rejects.toThrow();
    }

    // Circuit should now be OPEN — fast-fail without calling proxy
    const callsBeforeOpen = callCount;
    await expect(client.call('getUser', { id: 'after-open' })).rejects.toThrow(
      CircuitBreakerOpenError,
    );

    // Proxy was NOT called again after circuit opened
    expect(callCount).toBe(callsBeforeOpen);
    expect(client.getCircuitState()).toBe('OPEN');
  });
});
