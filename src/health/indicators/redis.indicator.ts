import { Inject, Injectable, Optional } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import { CACHE_SERVICE } from '../../cache/constants';
import { MultiCacheService } from '../../cache/multi-cache.service';

/**
 * Redis health indicator — pings the Redis L2 layer via MultiCacheService.
 *
 * If no cache service is injected (cache not configured), reports as "not configured".
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Optional() @Inject(CACHE_SERVICE) private readonly cacheService?: MultiCacheService,
  ) {}

  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    const session = this.indicator.check(key);

    if (!this.cacheService) {
      return session.up('not configured');
    }

    try {
      const testKey = '__nestjs_boot_health_check__';
      await this.cacheService.set(testKey, 'ok', { ttl: 5 });
      const val = await this.cacheService.get(testKey);
      const isUp = val === 'ok';
      await this.cacheService.del(testKey);

      if (isUp) {
        return session.up();
      }
      return session.down();
    } catch {
      return session.down();
    }
  }
}
