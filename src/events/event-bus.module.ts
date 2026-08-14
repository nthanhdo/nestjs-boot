import { DynamicModule, Logger, Module, OnModuleInit } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { EventBusOptions } from './interfaces';
import { EventBusService } from './event-bus.service';
import { EVENT_BUS_OPTIONS, EVENT_BUS_SERVICE, ON_EVENT_METADATA, ON_QUERY_METADATA } from './constants';

/**
 * EventBusModule — in-process or distributed event bus with typed events.
 *
 * Usage:
 * ```ts
 * EventBusModule.register({ transport: 'memory' })
 * EventBusModule.register({ transport: 'redis', redis: { url: 'redis://localhost:6379' } })
 * ```
 */
@Module({})
export class EventBusModule implements OnModuleInit {
  private static readonly logger = new Logger('EventBusModule');

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly eventBusService: EventBusService,
  ) {}

  static register(options: EventBusOptions): DynamicModule {
    const providers = [
      {
        provide: EVENT_BUS_OPTIONS,
        useValue: options,
      },
      {
        provide: EVENT_BUS_SERVICE,
        useFactory: () => {
          EventBusModule.logger.log(`EventBus initializing (transport: ${options.transport})`);
          return new EventBusService(options);
        },
      },
      {
        provide: EventBusService,
        useExisting: EVENT_BUS_SERVICE,
      },
    ];

    return {
      module: EventBusModule,
      imports: [DiscoveryModule],
      global: true,
      providers,
      exports: [EVENT_BUS_SERVICE, EventBusService],
    };
  }

  onModuleInit(): void {
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;

      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const eventMeta = this.reflector.get(ON_EVENT_METADATA, prototype[methodName]);
        if (eventMeta) {
          const { eventClass, options } = eventMeta;
          const handler = (instance as Record<string, (...args: unknown[]) => Promise<void> | void>)[methodName].bind(instance);
          this.eventBusService.registerHandler(eventClass, handler, options ?? {});
          EventBusModule.logger.log(
            `Registered @OnEvent handler: ${wrapper.metatype?.name ?? 'Unknown'}.${methodName} → ${eventClass.name}`,
          );
        }

        const queryMeta = this.reflector.get(ON_QUERY_METADATA, prototype[methodName]);
        if (queryMeta) {
          const { queryClass } = queryMeta;
          const handler = (instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind(instance);
          this.eventBusService.registerQueryHandler(queryClass, handler);
          EventBusModule.logger.log(
            `Registered @OnQuery handler: ${wrapper.metatype?.name ?? 'Unknown'}.${methodName} → ${queryClass.name}`,
          );
        }
      }
    }
  }
}
