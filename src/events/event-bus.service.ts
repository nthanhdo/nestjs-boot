import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { BootEvent } from './boot-event';
import { EventBusOptions, OnEventOptions } from './interfaces';

interface HandlerEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventClass: new (...args: any[]) => BootEvent;
  handler: (event: BootEvent) => Promise<void> | void;
  options: OnEventOptions;
}

/**
 * EventBusService — in-process or distributed event bus.
 *
 * Memory transport: handlers are invoked directly in-process.
 * Redis transport: events are published via Redis pub/sub for cross-service distribution.
 */
@Injectable()
export class EventBusService implements OnModuleDestroy {
  private readonly logger = new Logger('EventBusService');
  private readonly handlers: HandlerEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private redisPublisher: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private redisSubscriber: any = null;
  private readonly redisChannel = 'boot:events';

  constructor(options: EventBusOptions) {
    if (options.transport === 'redis' && options.redis?.url) {
      try {
        const IORedis = require('ioredis');
        this.redisPublisher = new IORedis(options.redis.url);
        this.redisSubscriber = new IORedis(options.redis.url);

        this.redisSubscriber.subscribe(this.redisChannel);
        this.redisSubscriber.on('message', (_channel: string, message: string) => {
          try {
            const parsed = JSON.parse(message);
            this.invokeHandlers(parsed.eventClassName, parsed.data);
          } catch (err) {
            this.logger.error('Failed to process Redis event message', err);
          }
        });

        this.logger.log('EventBus Redis transport connected');
      } catch {
        this.logger.warn(
          'ioredis not installed — falling back to memory transport. Install ioredis for Redis event bus.',
        );
      }
    }
  }

  /**
   * Register a handler for an event class.
   * @internal — used by EventBusModule during module init to wire @OnEvent decorators.
   */
  registerHandler(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventClass: new (...args: any[]) => BootEvent,
    handler: (event: BootEvent) => Promise<void> | void,
    options: OnEventOptions = {},
  ): void {
    this.handlers.push({ eventClass, handler, options });
  }

  /**
   * Emit an event. Fires all registered handlers.
   * For memory transport: fires handlers in background (fire-and-forget for sync handlers).
   * For Redis transport: publishes to Redis pub/sub channel.
   */
  async emit(event: BootEvent): Promise<void> {
    const eventClassName = event.constructor.name;

    if (this.redisPublisher) {
      await this.redisPublisher.publish(
        this.redisChannel,
        JSON.stringify({ eventClassName, data: event }),
      );
    }

    // Always invoke local handlers (even with Redis, for local subscribers)
    this.invokeHandlers(eventClassName, event, false);
  }

  /**
   * Emit an event and wait for ALL handlers to complete.
   */
  async emitAsync(event: BootEvent): Promise<void> {
    const eventClassName = event.constructor.name;

    if (this.redisPublisher) {
      await this.redisPublisher.publish(
        this.redisChannel,
        JSON.stringify({ eventClassName, data: event }),
      );
    }

    await this.invokeHandlers(eventClassName, event, true);
  }

  /**
   * Invoke local handlers matching the event class name.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async invokeHandlers(eventClassName: string, eventData: any, awaitAll = false): Promise<void> {
    const matching = this.handlers.filter(
      (h) => h.eventClass.name === eventClassName,
    );

    if (matching.length === 0) return;

    const promises: Promise<void>[] = [];

    for (const entry of matching) {
      try {
        const result = entry.handler(eventData);
        if (result instanceof Promise) {
          if (awaitAll || !entry.options.async) {
            promises.push(result);
          } else {
            // Fire-and-forget for async handlers
            result.catch((err) =>
              this.logger.error(`Async event handler error for ${eventClassName}`, err),
            );
          }
        }
      } catch (err) {
        this.logger.error(`Event handler error for ${eventClassName}`, err);
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisSubscriber) {
      try {
        await this.redisSubscriber.unsubscribe(this.redisChannel);
        await this.redisSubscriber.quit();
      } catch { /* best effort */ }
      this.redisSubscriber = null;
    }
    if (this.redisPublisher) {
      try {
        await this.redisPublisher.quit();
      } catch { /* best effort */ }
      this.redisPublisher = null;
    }
  }
}
