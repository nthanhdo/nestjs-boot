import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventBusService } from '../events/event-bus.service';
import { BootEvent } from '../events/boot-event';

/**
 * Outbox entry as persisted in the `outbox` collection.
 */
export interface OutboxEntry {
  _id?: unknown;
  /** Event type discriminator */
  type: string;
  /** Serialized event payload */
  data: Record<string, unknown>;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** When the event was persisted to the outbox */
  createdAt: Date;
  /** Whether the event has been published to the EventBus */
  published: boolean;
  /** Number of publish attempts */
  retryCount: number;
  /** Last error message (if any) */
  lastError?: string;
  /** When the event was published */
  publishedAt?: Date;
}

/**
 * OutboxProcessor — polls the outbox collection and publishes pending events
 * to the EventBus, guaranteeing at-least-once delivery.
 *
 * The Outbox Pattern solves the dual-write problem:
 * 1. Your command handler saves state change + event to the SAME database transaction
 * 2. This processor polls the outbox and publishes events asynchronously
 * 3. Even if the process crashes after step 1, events will be published on restart
 *
 * @example
 * ```ts
 * // In your command handler — save event to outbox in same transaction:
 * async execute(command: CreateOrderCommand) {
 *   const session = await this.connection.startSession();
 *   session.startTransaction();
 *   try {
 *     await this.orderCollection.insertOne(order, { session });
 *     await this.outboxCollection.insertOne({
 *       type: 'OrderCreated',
 *       data: { orderId: order.id, total: order.total },
 *       createdAt: new Date(),
 *       published: false,
 *       retryCount: 0,
 *     }, { session });
 *     await session.commitTransaction();
 *   } finally {
 *     session.endSession();
 *   }
 * }
 * ```
 */
@Injectable()
export class OutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OutboxProcessor');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly connection: any,
    private readonly eventBus: EventBusService,
    private readonly pollInterval: number,
    private readonly maxRetries: number,
  ) {}

  async onModuleInit(): Promise<void> {
    this.db = this.connection.db;

    // Index for efficient polling: unpublished, ordered by creation
    await this.db.collection('outbox').createIndex(
      { published: 1, createdAt: 1 },
    );

    // Start polling
    this.timer = setInterval(() => this.processOutbox(), this.pollInterval);
    this.logger.log(`OutboxProcessor started (poll every ${this.pollInterval}ms, max retries: ${this.maxRetries})`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Process pending outbox entries — publish to EventBus and mark as published.
   * Runs on a poll interval. Skips if a previous batch is still processing.
   */
  async processOutbox(): Promise<number> {
    if (this.processing) return 0;
    this.processing = true;

    try {
      const pending: OutboxEntry[] = await this.db
        .collection('outbox')
        .find({
          published: false,
          retryCount: { $lt: this.maxRetries },
        })
        .sort({ createdAt: 1 })
        .limit(100)
        .toArray();

      if (pending.length === 0) return 0;

      let published = 0;
      for (const entry of pending) {
        try {
          // Create a BootEvent-compatible object for the EventBus
          const event = Object.assign(Object.create(BootEvent.prototype), {
            ...entry.data,
            timestamp: entry.createdAt,
            correlationId: entry.correlationId,
          });
          // Set constructor name for handler matching
          Object.defineProperty(event.constructor, 'name', { value: entry.type });

          await this.eventBus.emitAsync(event);

          // Mark as published
          await this.db.collection('outbox').updateOne(
            { _id: entry._id },
            { $set: { published: true, publishedAt: new Date() } },
          );
          published++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed to publish outbox entry ${entry._id}: ${errorMsg}`);

          await this.db.collection('outbox').updateOne(
            { _id: entry._id },
            {
              $inc: { retryCount: 1 },
              $set: { lastError: errorMsg },
            },
          );
        }
      }

      if (published > 0) {
        this.logger.debug(`Outbox: published ${published}/${pending.length} events`);
      }
      return published;
    } finally {
      this.processing = false;
    }
  }

  /**
   * Persist an event to the outbox collection.
   * Call this within the same database transaction as your state change.
   *
   * @param type - Event type discriminator
   * @param data - Event payload
   * @param options - Optional: MongoDB session for transactional writes
   */
  async persistToOutbox(
    type: string,
    data: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: { session?: any; correlationId?: string },
  ): Promise<void> {
    const entry: Omit<OutboxEntry, '_id'> = {
      type,
      data,
      correlationId: options?.correlationId,
      createdAt: new Date(),
      published: false,
      retryCount: 0,
    };

    const insertOptions = options?.session ? { session: options.session } : {};
    await this.db.collection('outbox').insertOne(entry, insertOptions);
  }
}
