import { Inject, Injectable, Optional } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import { QueueService } from '../../queue/queue.service';

/**
 * Queue health indicator — checks BullMQ Redis connectivity.
 *
 * If QueueService is not injected (queue not configured), reports as "not configured".
 * Otherwise, attempts to get a queue instance to verify the Redis connection is alive.
 */
@Injectable()
export class QueueHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Optional() @Inject(QueueService) private readonly queueService?: QueueService,
  ) {}

  async isHealthy(key = 'queue'): Promise<HealthIndicatorResult> {
    const session = this.indicator.check(key);

    if (!this.queueService) {
      return session.up('not configured');
    }

    try {
      this.queueService.getQueue('__health_check__');
      return session.up();
    } catch (error) {
      return session.down(error instanceof Error ? error.message : String(error));
    }
  }
}
