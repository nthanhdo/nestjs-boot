import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthCheckResult, HealthIndicatorFunction } from '@nestjs/terminus';
import type { ShutdownService } from '../shutdown/shutdown.service';

/**
 * String token avoids NestJS 12 DI resolution failure when ShutdownModule
 * is not registered. The class token requires the provider to exist at
 * module compile time even with @Optional(), which breaks in NestJS 12.
 */
const SHUTDOWN_SERVICE_TOKEN = 'BOOT_SHUTDOWN_SERVICE';

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
    @Optional() @Inject('DatabaseHealthIndicator') private readonly dbIndicator: any,
    @Optional() @Inject('RedisHealthIndicator') private readonly redisIndicator: any,
    @Optional() @Inject('QueueHealthIndicator') private readonly queueIndicator: any,
    @Optional() @Inject(SHUTDOWN_SERVICE_TOKEN) private readonly shutdownService?: ShutdownService,
  ) {}

  @Get('healthz')
  getLiveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  getReadiness() {
    if (this.shutdownService?.isShuttingDownNow()) {
      throw new ServiceUnavailableException('Shutting down');
    }

    return { status: 'ok' };
  }

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
      checks.push(() => this.dbIndicator.isHealthy());
    }
    if (this.redisIndicator) {
      checks.push(() => this.redisIndicator.isHealthy());
    }
    if (this.queueIndicator) {
      checks.push(() => this.queueIndicator.isHealthy());
    }

    return this.health.check(checks);
  }
}
