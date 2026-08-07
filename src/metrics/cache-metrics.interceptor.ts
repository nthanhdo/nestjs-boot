import { Injectable, Inject } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * CacheMetricsInterceptor — records cache hit/miss counts and operation durations.
 *
 * Metrics emitted:
 *   boot_cache_hit_total{layer}                              — counter  (l1 | l2)
 *   boot_cache_miss_total{layer}                             — counter
 *   boot_cache_operation_duration_seconds{operation, layer}  — histogram
 *
 * Usage — wrap your cache layer calls:
 *
 *   const cacheMetrics = new CacheMetricsInterceptor(metricsService);
 *
 *   // Manual recording
 *   cacheMetrics.recordHit('l1');
 *   cacheMetrics.recordMiss('l1');
 *
 *   // Wrap cache get with auto-instrumentation
 *   const value = await cacheMetrics.wrapGet('l1', () => redisClient.get(key));
 *
 * Wire into MultiCacheService by injecting CacheMetricsInterceptor and calling
 * the wrap* helpers around each cache tier operation.
 */
@Injectable()
export class CacheMetricsInterceptor {
  private readonly hitCounter: any;
  private readonly missCounter: any;
  private readonly durationHistogram: any;

  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {
    this.hitCounter = this.metricsService.counter(
      'boot_cache_hit_total',
      'Total number of cache hits',
      ['layer'],
    );
    this.missCounter = this.metricsService.counter(
      'boot_cache_miss_total',
      'Total number of cache misses',
      ['layer'],
    );
    this.durationHistogram = this.metricsService.histogram(
      'boot_cache_operation_duration_seconds',
      'Duration of cache operations in seconds',
      [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
      ['operation', 'layer'],
    );
  }

  /**
   * Record a cache hit for a given layer (l1 | l2 | any string).
   */
  recordHit(layer: string = 'l1'): void {
    this.hitCounter.inc({ layer });
  }

  /**
   * Record a cache miss for a given layer.
   */
  recordMiss(layer: string = 'l1'): void {
    this.missCounter.inc({ layer });
  }

  /**
   * Wrap a cache GET operation: records duration + hit/miss based on whether
   * the fn returned a non-null/undefined value.
   *
   * @param layer  - cache tier label ('l1' | 'l2')
   * @param fn     - async function performing the cache lookup
   * @returns      - the value returned by fn (null/undefined = miss)
   */
  async wrapGet<T>(layer: string, fn: () => Promise<T | null | undefined>): Promise<T | null | undefined> {
    const end = this.durationHistogram.startTimer({ operation: 'get', layer });
    try {
      const value = await fn();
      end();
      if (value !== null && value !== undefined) {
        this.hitCounter.inc({ layer });
      } else {
        this.missCounter.inc({ layer });
      }
      return value;
    } catch (err) {
      end();
      this.missCounter.inc({ layer });
      throw err;
    }
  }

  /**
   * Wrap a cache SET operation: records duration.
   */
  async wrapSet<T>(layer: string, fn: () => Promise<T>): Promise<T> {
    const end = this.durationHistogram.startTimer({ operation: 'set', layer });
    try {
      const result = await fn();
      end();
      return result;
    } catch (err) {
      end();
      throw err;
    }
  }

  /**
   * Wrap a cache DELETE operation: records duration.
   */
  async wrapDel<T>(layer: string, fn: () => Promise<T>): Promise<T> {
    const end = this.durationHistogram.startTimer({ operation: 'del', layer });
    try {
      const result = await fn();
      end();
      return result;
    } catch (err) {
      end();
      throw err;
    }
  }
}
