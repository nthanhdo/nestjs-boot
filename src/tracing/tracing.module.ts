import { DynamicModule, Global, Module } from '@nestjs/common';
import type { TracingOptions } from './interfaces';
import { TracingService } from './tracing.service';
import { TRACING_OPTIONS } from './constants';

@Global()
@Module({})
export class TracingModule {
  static register(options?: TracingOptions): DynamicModule {
    return {
      module: TracingModule,
      providers: [
        {
          provide: TRACING_OPTIONS,
          useValue: options || {},
        },
        TracingService,
      ],
      exports: [TracingService, TRACING_OPTIONS],
    };
  }
}
