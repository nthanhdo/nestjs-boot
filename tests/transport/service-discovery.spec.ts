import { describe, it, expect, vi } from 'vitest';
import {
  fromResolverFn,
  staticUrl,
  ServiceDiscoveryHook,
} from '../../src/transport/service-discovery';

describe('ServiceDiscoveryHook utilities', () => {
  it('fromResolverFn wraps an async function as a ServiceDiscoveryHook', async () => {
    const hook = fromResolverFn(async () => ({ url: 'grpc://order-service:5000' }));

    const result = await hook.resolve();

    expect(result).toEqual({ url: 'grpc://order-service:5000' });
  });

  it('staticUrl always returns the same URL', async () => {
    const hook = staticUrl('tcp://user-service:3001');

    const [r1, r2] = await Promise.all([hook.resolve(), hook.resolve()]);

    expect(r1.url).toBe('tcp://user-service:3001');
    expect(r2.url).toBe('tcp://user-service:3001');
  });

  it('custom ServiceDiscoveryHook implementation is callable', async () => {
    // Simulate a Consul-style discovery implementation
    const consulResolve = vi.fn().mockResolvedValue({ url: 'grpc://consul-resolved:9000' });

    const hook: ServiceDiscoveryHook = {
      resolve: consulResolve,
    };

    const result = await hook.resolve();

    expect(result.url).toBe('grpc://consul-resolved:9000');
    expect(consulResolve).toHaveBeenCalledOnce();
  });
});
