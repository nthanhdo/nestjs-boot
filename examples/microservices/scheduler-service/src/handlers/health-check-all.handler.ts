import { Injectable, Logger } from '@nestjs/common';

/**
 * Example handler: ping all services' health endpoints.
 * In production, this would HTTP GET each service's /health.
 * Suggested cron: "*/5 * * * *" (every 5 minutes)
 */
@Injectable()
export class HealthCheckAllHandler {
  private readonly logger = new Logger(HealthCheckAllHandler.name);

  async execute(
    payload: Record<string, unknown>,
  ): Promise<{ services: Record<string, string> }> {
    this.logger.log(
      `[health-check-all] Running with payload: ${JSON.stringify(payload)}`,
    );

    // Simulated health checks
    const services = {
      'auth-service': 'healthy',
      'order-service': 'healthy',
      'product-service': 'healthy',
      'notification-service': 'healthy',
    };

    this.logger.log(
      `[health-check-all] All services checked: ${JSON.stringify(services)}`,
    );

    return { services };
  }
}
