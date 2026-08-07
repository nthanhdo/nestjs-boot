import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MetricsModule, MetricsService, DbMetricsInterceptor } from '../../src/metrics';

describe('DbMetricsInterceptor', () => {
  let metricsService: MetricsService;
  let interceptor: DbMetricsInterceptor;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.register({ defaultMetrics: false })],
      providers: [DbMetricsInterceptor],
    }).compile();

    metricsService = moduleRef.get(MetricsService);
    interceptor = moduleRef.get(DbMetricsInterceptor);
  });

  it('recordOperation resolves and emits success counter', async () => {
    let called = false;
    const result = await interceptor.recordOperation('mongodb', 'find', async () => {
      called = true;
      return { docs: [{ _id: '1' }] };
    });

    expect(called).toBe(true);
    expect(result).toEqual({ docs: [{ _id: '1' }] });

    // Verify counter was registered on the MetricsService
    const registry = metricsService.getRegistry();
    if (registry) {
      const metrics = await registry.getMetricsAsJSON();
      const counter = metrics.find((m: any) => m.name.includes('boot_db_query_total'));
      expect(counter).toBeDefined();
      const successValue = counter?.values?.find(
        (v: any) => v.labels?.status === 'success' && v.labels?.operation === 'find',
      );
      expect(successValue?.value).toBeGreaterThanOrEqual(1);
    }
  });

  it('recordOperation increments error counter on thrown exception', async () => {
    await expect(
      interceptor.recordOperation('mongodb', 'insertOne', async () => {
        throw new Error('Connection timeout');
      }),
    ).rejects.toThrow('Connection timeout');

    const registry = metricsService.getRegistry();
    if (registry) {
      const metrics = await registry.getMetricsAsJSON();
      const counter = metrics.find((m: any) => m.name.includes('boot_db_query_total'));
      const errorValue = counter?.values?.find(
        (v: any) => v.labels?.status === 'error' && v.labels?.operation === 'insertOne',
      );
      expect(errorValue?.value).toBeGreaterThanOrEqual(1);
    }
  });

  it('mongoosePlugin returns a function that can be applied to a schema', () => {
    const plugin = DbMetricsInterceptor.mongoosePlugin(metricsService);
    expect(typeof plugin).toBe('function');

    // Simulate a minimal Mongoose schema object with pre/post hooks
    const registeredHooks: string[] = [];
    const mockSchema = {
      pre: (op: string, _fn: any) => { registeredHooks.push(`pre:${op}`); },
      post: (op: string, _fn: any) => { registeredHooks.push(`post:${op}`); },
    };

    plugin(mockSchema);

    // Should have registered hooks for common query operations
    expect(registeredHooks.some((h) => h.startsWith('pre:find'))).toBe(true);
    expect(registeredHooks.some((h) => h.startsWith('pre:aggregate'))).toBe(true);
    expect(registeredHooks.some((h) => h.startsWith('pre:save'))).toBe(true);
  });
});
