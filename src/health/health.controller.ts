import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthCheckResult, HealthIndicatorFunction } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { RedisHealthIndicator } from './indicators/redis.indicator';
import { ShutdownService } from '../shutdown/shutdown.service';

/**
 * Health check controller — GET endpoint at configured path.
 * Runs all registered health indicators.
 *
 * Returns 503 when a graceful shutdown is in progress so that K8s readiness
 * probes fail immediately — the pod is removed from the load balancer before
 * in-flight connections are drained.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DatabaseHealthIndicator | null,
    private readonly redisIndicator: RedisHealthIndicator | null,
    @Optional() @Inject(ShutdownService) private readonly shutdownService?: ShutdownService,
  ) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    // Return 503 during shutdown so K8s readiness probe fails immediately.
    // This causes the pod to be removed from the service endpoint before
    // connections are drained — zero-downtime rolling deployments.
    if (this.shutdownService?.isShuttingDownNow()) {
      throw new ServiceUnavailableException(
        'Service is shutting down — readiness probe intentionally failing',
      );
    }

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
