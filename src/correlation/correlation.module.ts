import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationIdMiddleware, CorrelationOptions } from './correlation.middleware';
import { CORRELATION_OPTIONS } from './constants';

@Module({})
export class CorrelationModule implements NestModule {
  static register(options?: CorrelationOptions): DynamicModule {
    return {
      module: CorrelationModule,
      global: true,
      providers: [
        {
          provide: CORRELATION_OPTIONS,
          useValue: options ?? {},
        },
        CorrelationIdMiddleware,
      ],
      exports: [CorrelationIdMiddleware, CORRELATION_OPTIONS],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
