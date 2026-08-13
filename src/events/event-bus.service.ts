import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { BootEvent } from './boot-event';
import { EventBusOptions, OnEventOptions, EmitAndWaitOptions } from './interfaces';

/** Minimal shape for an ioredis client used for pub/sub (optional dep) */
interface RedisPubSubClient {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  quit(): Promise<void>;
}

interface HandlerEntry {
  eventClass: new (...args: unknown[]) => BootEvent;
  handler: (event: BootEvent) => Promise<void> | void;
  options: OnEventOptions;
}

interface QueryHandlerEntry {
  queryClass: new (...args: unknown[]) => BootEvent;
  handler: (query: BootEvent) => Promise<unknown> | unknown;
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
  private readonly queryHandlers = new Map<string, QueryHandlerEntry>();
  private redisPublisher: RedisPubSubClient | null = null;
  private redisSubscriber: RedisPubSubClient | null = null;
  private readonly redisChannel = 'boot:events';

  /** Whether this service owns the Redis clients (and should close them on destroy) */
  private ownsRedisClients = false;

  constructor(options: EventBusOptions) {
    if (options.transport === 'redis') {
      // Prefer injected Redis clients over creating new ones
      if (options.redisClient) {
        this.redisPublisher = options.redisClient.publisher as RedisPubSubClient;
        this.redisSubscriber = options.redisClient.subscriber as RedisPubSubClient;
        this.ownsRedisClients = false;
        this.setupRedisSubscriber();
        this.logger.log('EventBus Redis transport connected (injected client)');
      } else if (options.redis?.url) {
        try {
          const IORedis = require('ioredis');
          this.redisPublisher = new IORedis(options.redis.url) as RedisPubSubClient;
          this.redisSubscriber = new IORedis(options.redis.url) as RedisPubSubClient;
          this.ownsRedisClients = true;
          this.setupRedisSubscriber();
          this.logger.log('EventBus Redis transport connected');
        } catch {
          this.logger.warn(
            'ioredis not installed — falling back to memory transport. Install ioredis for Redis event bus.',
          );
        }
      }
    }
  }

  private setupRedisSubscriber(): void {
    this.redisSubscriber!.subscribe(this.redisChannel);
    this.redisSubscriber!.on('message', (_channel: unknown, message: unknown) => {
      try {
        const parsed = JSON.parse(message as string);
        this.invokeHandlers(parsed.eventClassName, parsed.data);
      } catch (err) {
        this.logger.error('Failed to process Redis event message', err);
      }
    });
  }

  /**
   * Register a handler for an event class.
   * @internal — used by EventBusModule during module init to wire @OnEvent decorators.
   */
  registerHandler(
    eventClass: new (...args: unknown[]) => BootEvent,
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
  private async invokeHandlers(eventClassName: string, eventData: BootEvent | Record<string, unknown>, awaitAll = false): Promise<void> {
    const matching = this.handlers.filter(
      (h) => h.eventClass.name === eventClassName,
    );

    if (matching.length === 0) return;

    const promises: Promise<void>[] = [];

    for (const entry of matching) {
      try {
        const result = entry.handler(eventData as BootEvent);
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

  /**
   * Register a handler for a query class (request/reply pattern).
   * Only ONE handler per query class is allowed — queries expect a single response.
   * @internal — used by EventBusModule during module init to wire @OnQuery decorators.
   */
  registerQueryHandler(
    queryClass: new (...args: unknown[]) => BootEvent,
    handler: (query: BootEvent) => Promise<unknown> | unknown,
  ): void {
    const name = queryClass.name;
    if (this.queryHandlers.has(name)) {
      this.logger.warn(
        `Query handler for "${name}" is being overwritten. Only one handler per query is allowed.`,
      );
    }
    this.queryHandlers.set(name, { queryClass, handler });
  }

  /**
   * Emit a query and wait for the handler to return a result.
   *
   * This is the KEY method for breaking circular dependencies when you need
   * a return value. Instead of injecting ServiceB directly (which creates a
   * circular dep), emit a query and let ServiceB's module handle it.
   *
   * @example
   * ```ts
   * // In OrderService (no import of UserModule needed):
   * const user = await this.eventBus.emitAndWait<User>(
   *   new GetUserByIdQuery(userId),
   *   { timeout: 5000 }
   * );
   * ```
   *
   * @throws Error if no handler is registered or if the handler does not respond within the timeout
   */
  async emitAndWait<T = unknown>(
    query: BootEvent,
    options?: EmitAndWaitOptions,
  ): Promise<T> {
    const queryClassName = query.constructor.name;
    const timeout = options?.timeout ?? 5000;

    const entry = this.queryHandlers.get(queryClassName);
    if (!entry) {
      throw new Error(
        `No handler registered for query "${queryClassName}". ` +
        `Did you forget to use @OnQuery(${queryClassName}) in a provider? ` +
        `The provider's module must be imported somewhere in the app.`,
      );
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Query "${queryClassName}" timed out after ${timeout}ms. ` +
            `The handler may be stuck or performing a long-running operation.`,
          ),
        );
      }, timeout);

      try {
        const result = entry.handler(query);
        if (result instanceof Promise) {
          result
            .then((val) => {
              clearTimeout(timer);
              resolve(val as T);
            })
            .catch((err) => {
              clearTimeout(timer);
              reject(err);
            });
        } else {
          clearTimeout(timer);
          resolve(result as T);
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    // Only close Redis clients if we created them ourselves
    if (!this.ownsRedisClients) {
      this.redisSubscriber = null;
      this.redisPublisher = null;
      return;
    }
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
