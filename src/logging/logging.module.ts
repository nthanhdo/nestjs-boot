import { DynamicModule, Module } from '@nestjs/common';
import { LoggingOptions } from './interfaces';
import { LOGGING_OPTIONS } from './constants';
import { BootLogger } from './boot-logger';
import { LoggingInterceptor } from './logging.interceptor';

@Module({})
export class LoggingModule {
  static register(options?: LoggingOptions): DynamicModule {
    const opts: LoggingOptions = { level: 'info', ...options };
    const logger = new BootLogger(opts);

    return {
      module: LoggingModule,
      global: true,
      providers: [
        { provide: LOGGING_OPTIONS, useValue: opts },
        { provide: BootLogger, useValue: logger },
        LoggingInterceptor,
      ],
      exports: [BootLogger, LoggingInterceptor, LOGGING_OPTIONS],
    };
  }
}
