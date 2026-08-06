import { DynamicModule, Logger, Module } from '@nestjs/common';
import { EventBusOptions } from './interfaces';
import { EventBusService } from './event-bus.service';
import { EVENT_BUS_OPTIONS, EVENT_BUS_SERVICE } from './constants';

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
export class EventBusModule {
  private static readonly logger = new Logger('EventBusModule');

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
      global: true,
      providers,
      exports: [EVENT_BUS_SERVICE, EventBusService],
    };
  }
}
