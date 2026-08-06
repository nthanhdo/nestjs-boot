import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { QueueOptions } from './interfaces';

/**
 * QueueService — manages BullMQ queues and provides job-adding methods.
 *
 * BullMQ is loaded dynamically (optional dependency). If not installed,
 * all methods throw with a helpful message.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger('QueueService');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly queues = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly workers = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bullmq: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;

  constructor(private readonly options: QueueOptions) {
    try {
      this.bullmq = require('bullmq');
    } catch {
      this.logger.warn(
        'bullmq not installed — QueueService will not function. Install bullmq for queue support.',
      );
    }

    if (this.bullmq && options.redis?.url) {
      const IORedis = require('ioredis');
      this.connection = new IORedis(options.redis.url, { maxRetriesPerRequest: null });
    }
  }

  /**
   * Get or create a BullMQ Queue by name.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getQueue(name: string): any {
    if (!this.bullmq) {
      throw new Error('bullmq is not installed. Install it to use QueueService.');
    }

    if (!this.queues.has(name)) {
      const queue = new this.bullmq.Queue(name, {
        connection: this.connection,
        defaultJobOptions: this.options.defaultOptions,
      });
      this.queues.set(name, queue);
    }

    return this.queues.get(name);
  }

  /**
   * Add a single job to a named queue.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async addJob(queueName: string, jobName: string, data: any, opts?: any): Promise<any> {
    const queue = this.getQueue(queueName);
    return queue.add(jobName, data, opts);
  }

  /**
   * Add multiple jobs to a named queue in bulk.
   */
  async addBulk(
    queueName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobs: { name: string; data: any; opts?: any }[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    const queue = this.getQueue(queueName);
    return queue.addBulk(jobs);
  }

  /**
   * Register a worker for a queue (used internally by QueueModule to wire @Processor classes).
   * @internal
   */
  registerWorker(
    queueName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processor: (job: any) => Promise<any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handlers?: { onFailed?: (job: any, error: Error) => void; onCompleted?: (job: any, result: any) => void },
  ): void {
    if (!this.bullmq) {
      this.logger.warn('bullmq not installed — cannot register worker.');
      return;
    }

    const worker = new this.bullmq.Worker(queueName, processor, {
      connection: this.connection,
    });

    if (handlers?.onFailed) {
      worker.on('failed', handlers.onFailed);
    }
    if (handlers?.onCompleted) {
      worker.on('completed', handlers.onCompleted);
    }

    this.workers.set(queueName, worker);
    this.logger.log(`Worker registered for queue "${queueName}"`);
  }

  async onModuleDestroy(): Promise<void> {
    // Close all workers
    for (const [name, worker] of this.workers) {
      try {
        await worker.close();
        this.logger.log(`Worker for "${name}" closed`);
      } catch {
        this.logger.warn(`Failed to close worker for "${name}"`);
      }
    }
    this.workers.clear();

    // Close all queues
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
        this.logger.log(`Queue "${name}" closed`);
      } catch {
        this.logger.warn(`Failed to close queue "${name}"`);
      }
    }
    this.queues.clear();

    // Close shared connection
    if (this.connection) {
      try {
        await this.connection.quit();
      } catch { /* best effort */ }
      this.connection = null;
    }
  }
}
