import { Injectable, Inject } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * QueueMetrics — records job counts, durations, and queue depth for Bull/BullMQ queues.
 *
 * Metrics emitted:
 *   boot_queue_jobs_total{queue, status}                — counter  (completed | failed | stalled)
 *   boot_queue_job_duration_seconds{queue}              — histogram
 *   boot_queue_depth{queue}                             — gauge
 *
 * Usage — wire into Bull global events:
 *
 *   const queueMetrics = app.get(QueueMetrics);
 *
 *   // Bull / BullMQ events
 *   myQueue.on('completed', (job) => {
 *     queueMetrics.recordCompleted('email', job.processedOn! - job.timestamp);
 *   });
 *   myQueue.on('failed', (job, err) => {
 *     queueMetrics.recordFailed('email');
 *   });
 *
 *   // Update depth periodically or after enqueue/dequeue
 *   queueMetrics.setDepth('email', await myQueue.count());
 *
 * Or use the convenience wrapper:
 *   const result = await queueMetrics.wrapJob('email', () => processJob(data));
 */
@Injectable()
export class QueueMetrics {
  private readonly jobsCounter: any;
  private readonly durationHistogram: any;
  private readonly depthGauge: any;

  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {
    this.jobsCounter = this.metricsService.counter(
      'boot_queue_jobs_total',
      'Total number of queue jobs by status',
      ['queue', 'status'],
    );
    this.durationHistogram = this.metricsService.histogram(
      'boot_queue_job_duration_seconds',
      'Duration of queue job processing in seconds',
      [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      ['queue'],
    );
    this.depthGauge = this.metricsService.gauge(
      'boot_queue_depth',
      'Number of pending jobs in the queue',
      ['queue'],
    );
  }

  /**
   * Record a completed job.
   *
   * @param queue       - queue name
   * @param durationMs  - processing duration in milliseconds (optional)
   */
  recordCompleted(queue: string, durationMs?: number): void {
    this.jobsCounter.inc({ queue, status: 'completed' });
    if (durationMs !== undefined) {
      this.durationHistogram.observe({ queue }, durationMs / 1000);
    }
  }

  /**
   * Record a failed job.
   */
  recordFailed(queue: string): void {
    this.jobsCounter.inc({ queue, status: 'failed' });
  }

  /**
   * Record a stalled job (timed out without completing).
   */
  recordStalled(queue: string): void {
    this.jobsCounter.inc({ queue, status: 'stalled' });
  }

  /**
   * Update the queue depth gauge.
   */
  setDepth(queue: string, depth: number): void {
    this.depthGauge.labels(queue).set(depth);
  }

  /**
   * Wrap a job processor function with automatic timing and status recording.
   *
   * @param queue - queue name
   * @param fn    - async job processor function
   * @returns     - resolves with the job result, or throws on failure
   */
  async wrapJob<T>(queue: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - start;
      this.recordCompleted(queue, durationMs);
      return result;
    } catch (err) {
      this.recordFailed(queue);
      throw err;
    }
  }
}
