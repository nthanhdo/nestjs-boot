import { DynamicModule, Logger, Module, OnModuleInit } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { QueueOptions } from './interfaces';
import { QueueService } from './queue.service';
import { QUEUE_OPTIONS, QUEUE_PREFIX, PROCESSOR_METADATA, PROCESS_METADATA, ON_FAILED_METADATA, ON_COMPLETED_METADATA } from './constants';

/**
 * QueueModule — config-driven queue abstraction with BullMQ.
 *
 * Usage:
 * ```ts
 * QueueModule.register({
 *   driver: 'bullmq',
 *   redis: { url: 'redis://localhost:6379' },
 *   defaultOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
 * })
 * ```
 *
 * Then inject QueueService to add jobs:
 * ```ts
 * constructor(private readonly queueService: QueueService) {}
 * await this.queueService.addJob('email', 'send-welcome', { to: 'user@example.com' });
 * ```
 */
@Module({})
export class QueueModule implements OnModuleInit {
  private static readonly logger = new Logger('QueueModule');

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Register the queue system with global options (connection, defaults).
   */
  static register(options: QueueOptions): DynamicModule {
    const providers = [
      {
        provide: QUEUE_OPTIONS,
        useValue: options,
      },
      {
        provide: QueueService,
        useFactory: () => {
          QueueModule.logger.log(`Queue system initializing (driver: ${options.driver})`);
          return new QueueService(options);
        },
      },
    ];

    return {
      module: QueueModule,
      imports: [DiscoveryModule],
      global: true,
      providers,
      exports: [QueueService, QUEUE_OPTIONS],
    };
  }

  /**
   * Register a specific named queue. Use after `register()` to create dedicated queues.
   */
   
  static registerQueue(name: string, _options?: Partial<QueueOptions>): DynamicModule {
    const token = `${QUEUE_PREFIX}${name}`;

    const providers = [
      {
        provide: token,
        useFactory: (queueService: QueueService) => {
          return queueService.getQueue(name);
        },
        inject: [QueueService],
      },
    ];

    return {
      module: QueueModule,
      providers,
      exports: [token],
    };
  }

  onModuleInit(): void {
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;

      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      // Check class-level @Processor metadata
      const queueName = this.reflector.get<string>(PROCESSOR_METADATA, wrapper.metatype);
      if (!queueName) continue;

      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      // Find @Process, @OnFailed, @OnCompleted methods
      let processHandler: ((job: unknown) => Promise<unknown>) | undefined;
      let onFailedHandler: ((job: unknown, error: Error) => void) | undefined;
      let onCompletedHandler: ((job: unknown, result: unknown) => void) | undefined;
      let processJobName: string | undefined;

      for (const methodName of methodNames) {
        const processMeta = this.reflector.get<string>(PROCESS_METADATA, prototype[methodName]);
        if (processMeta !== undefined) {
          processJobName = processMeta === '*' ? undefined : processMeta;
          processHandler = (instance as Record<string, (...args: unknown[]) => Promise<unknown>>)[methodName].bind(instance);
        }

        const failedMeta = this.reflector.get(ON_FAILED_METADATA, prototype[methodName]);
        if (failedMeta) {
          onFailedHandler = (instance as Record<string, (...args: unknown[]) => void>)[methodName].bind(instance);
        }

        const completedMeta = this.reflector.get(ON_COMPLETED_METADATA, prototype[methodName]);
        if (completedMeta) {
          onCompletedHandler = (instance as Record<string, (...args: unknown[]) => void>)[methodName].bind(instance);
        }
      }

      if (processHandler) {
        // Wrap processor to filter by job name if specified
        const rawHandler = processHandler;
        const processor = processJobName
          ? async (job: unknown): Promise<unknown> => {
              const jobObj = job as { name?: string };
              if (jobObj.name === processJobName) {
                return rawHandler(job);
              }
              return undefined;
            }
          : rawHandler;

        this.queueService.registerWorker(queueName, processor, {
          onFailed: onFailedHandler,
          onCompleted: onCompletedHandler,
        });

        QueueModule.logger.log(
          `Registered @Processor worker: ${wrapper.metatype?.name ?? 'Unknown'} → queue "${queueName}"${processJobName ? ` (job: ${processJobName})` : ''}`,
        );
      }
    }
  }
}
