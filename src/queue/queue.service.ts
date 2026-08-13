import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { QueueOptions } from './interfaces';

/** Minimal shape for a BullMQ Queue (optional dep) */
interface BullQueue {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
  addBulk(jobs: { name: string; data: unknown; opts?: unknown }[]): Promise<unknown[]>;
  close(): Promise<void>;
}

/** Minimal shape for a BullMQ Worker (optional dep) */
interface BullWorker {
  on(event: string, handler: (...args: unknown[]) => void): void;
  close(): Promise<void>;
}

/** Minimal shape for an ioredis connection (optional dep) */
interface RedisConnection {
  quit(): Promise<void>;
}

/**
 * QueueService — manages BullMQ queues and provides job-adding methods.
 *
 * BullMQ is loaded dynamically (optional dependency). If not installed,
 * all methods throw with a helpful message.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger('QueueService');
  private readonly queues = new Map<string, BullQueue>();
  private readonly workers = new Map<string, BullWorker>();
  private bullmq: Record<string, unknown> | null = null;
  private connection: RedisConnection | null = null;

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
      this.connection = new IORedis(options.redis.url, { maxRetriesPerRequest: null }) as RedisConnection;
    }
  }

  /**
   * Get or create a BullMQ Queue by name.
   */
  getQueue(name: string): BullQueue {
    if (!this.bullmq) {
      throw new Error('bullmq is not installed. Install it to use QueueService.');
    }

    if (!this.queues.has(name)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const QueueCtor = (this.bullmq as Record<string, new (...args: unknown[]) => BullQueue>).Queue;
      const queue = new QueueCtor(name, {
        connection: this.connection,
        defaultJobOptions: this.options.defaultOptions,
      });
      this.queues.set(name, queue);
    }

    return this.queues.get(name)!;
  }

  /**
   * Add a single job to a named queue.
   */
  async addJob(queueName: string, jobName: string, data: unknown, opts?: unknown): Promise<unknown> {
    const queue = this.getQueue(queueName);
    return queue.add(jobName, data, opts);
  }

  /**
   * Add multiple jobs to a named queue in bulk.
   */
  async addBulk(
    queueName: string,
    jobs: { name: string; data: unknown; opts?: unknown }[],
  ): Promise<unknown[]> {
    const queue = this.getQueue(queueName);
    return queue.addBulk(jobs);
  }

  /**
   * Register a worker for a queue (used internally by QueueModule to wire @Processor classes).
   * @internal
   */
  registerWorker(
    queueName: string,
    processor: (job: unknown) => Promise<unknown>,
    handlers?: { onFailed?: (job: unknown, error: Error) => void; onCompleted?: (job: unknown, result: unknown) => void },
  ): void {
    if (!this.bullmq) {
      this.logger.warn('bullmq not installed — cannot register worker.');
      return;
    }

    const WorkerCtor = (this.bullmq as Record<string, new (...args: unknown[]) => BullWorker>).Worker;
    const worker = new WorkerCtor(queueName, processor, {
      connection: this.connection,
    });

    if (handlers?.onFailed) {
      worker.on('failed', handlers.onFailed as (...args: unknown[]) => void);
    }
    if (handlers?.onCompleted) {
      worker.on('completed', handlers.onCompleted as (...args: unknown[]) => void);
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
