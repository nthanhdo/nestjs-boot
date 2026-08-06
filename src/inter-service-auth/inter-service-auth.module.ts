import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { INTER_SERVICE_AUTH_OPTIONS } from './constants';
import { InterServiceAuthOptions } from './interfaces';
import { AuthPropagationInterceptor } from './auth-propagation.interceptor';

@Module({})
export class InterServiceAuthModule {
  /**
   * Register the inter-service auth module with options.
   * Provides the AuthPropagationInterceptor globally.
   */
  static register(options: InterServiceAuthOptions): DynamicModule {
    return {
      module: InterServiceAuthModule,
      global: true,
      providers: [
        {
          provide: INTER_SERVICE_AUTH_OPTIONS,
          useValue: options,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: AuthPropagationInterceptor,
        },
      ],
      exports: [INTER_SERVICE_AUTH_OPTIONS],
    };
  }
}
