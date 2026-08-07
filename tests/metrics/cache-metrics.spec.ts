import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MetricsModule, MetricsService, CacheMetricsInterceptor } from '../../src/metrics';

describe('CacheMetricsInterceptor', () => {
  let metricsService: MetricsService;
  let cacheMetrics: CacheMetricsInterceptor;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.register({ defaultMetrics: false })],
      providers: [CacheMetricsInterceptor],
    }).compile();

    metricsService = moduleRef.get(MetricsService);
    cacheMetrics = moduleRef.get(CacheMetricsInterceptor);
  });

  it('wrapGet records a hit when function returns a non-null value', async () => {
    const value = await cacheMetrics.wrapGet('l1', async () => 'cached-value');

    expect(value).toBe('cached-value');

    const registry = metricsService.getRegistry();
    if (registry) {
      const metrics = await registry.getMetricsAsJSON();
      const hitCounter = metrics.find((m: any) => m.name.includes('boot_cache_hit_total'));
      expect(hitCounter).toBeDefined();
      const l1Hit = hitCounter?.values?.find((v: any) => v.labels?.layer === 'l1');
      expect(l1Hit?.value).toBeGreaterThanOrEqual(1);
    }
  });

  it('wrapGet records a miss when function returns null', async () => {
    const value = await cacheMetrics.wrapGet('l2', async () => null);

    expect(value).toBeNull();

    const registry = metricsService.getRegistry();
    if (registry) {
      const metrics = await registry.getMetricsAsJSON();
      const missCounter = metrics.find((m: any) => m.name.includes('boot_cache_miss_total'));
      expect(missCounter).toBeDefined();
      const l2Miss = missCounter?.values?.find((v: any) => v.labels?.layer === 'l2');
      expect(l2Miss?.value).toBeGreaterThanOrEqual(1);
    }
  });

  it('wrapSet records operation duration in histogram', async () => {
    await cacheMetrics.wrapSet('l1', async () => 'ok');

    const registry = metricsService.getRegistry();
    if (registry) {
      const metrics = await registry.getMetricsAsJSON();
      const histogram = metrics.find((m: any) => m.name.includes('boot_cache_operation_duration_seconds'));
      expect(histogram).toBeDefined();
      // Histogram should have at least one observed value (count bucket)
      const setCount = histogram?.values?.find(
        (v: any) => v.labels?.operation === 'set' && v.metricName?.includes('_count'),
      );
      expect(setCount?.value).toBeGreaterThanOrEqual(1);
    }
  });
});
