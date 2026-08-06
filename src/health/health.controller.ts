import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthCheckResult, HealthIndicatorFunction } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { RedisHealthIndicator } from './indicators/redis.indicator';

/**
 * Health check controller — GET endpoint at configured path.
 * Runs all registered health indicators.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DatabaseHealthIndicator | null,
    private readonly redisIndicator: RedisHealthIndicator | null,
  ) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    const checks: HealthIndicatorFunction[] = [];

    if (this.dbIndicator) {
      checks.push(() => this.dbIndicator!.isHealthy());
    }
    if (this.redisIndicator) {
      checks.push(() => this.redisIndicator!.isHealthy());
    }

    return this.health.check(checks);
  }
}
