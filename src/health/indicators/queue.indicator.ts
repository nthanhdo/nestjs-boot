import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { QueueService } from '../../queue/queue.service';

/**
 * Queue health indicator — checks BullMQ Redis connectivity.
 *
 * If QueueService is not injected (queue not configured), reports as "not configured".
 * Otherwise, attempts to get a queue instance to verify the Redis connection is alive.
 */
@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(
    @Optional() @Inject(QueueService) private readonly queueService?: QueueService,
  ) {
    super();
  }

  async isHealthy(key = 'queue'): Promise<HealthIndicatorResult> {
    if (!this.queueService) {
      return this.getStatus(key, true, { status: 'not configured' });
    }

    try {
      // Attempt to get/create a health-check queue — this verifies
      // that BullMQ is installed and the Redis connection is live.
      this.queueService.getQueue('__health_check__');
      const result = this.getStatus(key, true, { status: 'up' });
      return result;
    } catch (error) {
      const result = this.getStatus(key, false, {
        status: 'down',
        message: error instanceof Error ? error.message : String(error),
      });
      throw new HealthCheckError('Queue health check failed', result);
    }
  }
}
