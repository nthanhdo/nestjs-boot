import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { CACHE_SERVICE } from '../../cache/constants';
import { MultiCacheService } from '../../cache/multi-cache.service';

/**
 * Redis health indicator — pings the Redis L2 layer via MultiCacheService.
 *
 * If no cache service is injected (cache not configured), reports as "not configured".
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @Optional() @Inject(CACHE_SERVICE) private readonly cacheService?: MultiCacheService,
  ) {
    super();
  }

  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    if (!this.cacheService) {
      return this.getStatus(key, true, { status: 'not configured' });
    }

    try {
      // Attempt a simple cache operation to verify connectivity
      const testKey = '__nestjs_boot_health_check__';
      await this.cacheService.set(testKey, 'ok', { ttl: 5 });
      const val = await this.cacheService.get(testKey);
      const isUp = val === 'ok';
      await this.cacheService.del(testKey);

      const result = this.getStatus(key, isUp, { status: isUp ? 'up' : 'down' });
      if (!isUp) {
        throw new HealthCheckError('Redis check failed', result);
      }
      return result;
    } catch (error) {
      if (error instanceof HealthCheckError) throw error;
      const result = this.getStatus(key, false, { status: 'down' });
      throw new HealthCheckError('Redis check failed', result);
    }
  }
}
