import { DynamicModule, Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { MetricsOptions } from './interfaces';
import { METRICS_OPTIONS } from './constants';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { DEFAULT_METRICS_PATH } from './constants';

@Module({})
export class MetricsModule {
  static register(options?: MetricsOptions): DynamicModule {
    const opts: MetricsOptions = { enabled: true, defaultMetrics: true, ...options };

    if (opts.enabled === false) {
      return {
        module: MetricsModule,
        global: true,
        providers: [
          { provide: METRICS_OPTIONS, useValue: opts },
          MetricsService,
          HttpMetricsInterceptor,
        ],
        exports: [MetricsService, HttpMetricsInterceptor, METRICS_OPTIONS],
      };
    }

    const path = opts.path ?? DEFAULT_METRICS_PATH;

    return {
      module: MetricsModule,
      global: true,
      imports: [
        RouterModule.register([
          {
            path,
            module: MetricsModule,
          },
        ]),
      ],
      controllers: [MetricsController],
      providers: [
        { provide: METRICS_OPTIONS, useValue: opts },
        MetricsService,
        HttpMetricsInterceptor,
      ],
      exports: [MetricsService, HttpMetricsInterceptor, METRICS_OPTIONS],
    };
  }
}
