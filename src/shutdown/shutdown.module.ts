import { DynamicModule, Global, Module } from '@nestjs/common';
import { ShutdownOptions } from './interfaces';
import { ShutdownService } from './shutdown.service';
import { InFlightTracker } from './in-flight-tracker';
import { SHUTDOWN_OPTIONS } from './constants';

@Global()
@Module({})
export class ShutdownModule {
  /**
   * Register the GracefulShutdownModule.
   *
   * Usage:
   * ```ts
   * ShutdownModule.register({
   *   timeout: 30000,
   *   signals: ['SIGTERM', 'SIGINT'],
   *   beforeShutdown: async () => { console.log('cleaning up...'); },
   * })
   * ```
   */
  static register(options: ShutdownOptions = {}): DynamicModule {
    return {
      module: ShutdownModule,
      global: true,
      providers: [
        {
          provide: SHUTDOWN_OPTIONS,
          useValue: options,
        },
        InFlightTracker,
        ShutdownService,
      ],
      exports: [ShutdownService, InFlightTracker],
    };
  }
}
