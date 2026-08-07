import { DynamicModule, Module } from '@nestjs/common';
import { SwaggerOptions } from './interfaces';

const SWAGGER_OPTIONS = 'SWAGGER_OPTIONS';

/**
 * SwaggerModule — auto-configure Swagger/OpenAPI for nestjs-boot apps.
 *
 * This module stores options at DI level so `setupSwagger()` can be called
 * from `createApp()` after the NestJS app instance is available.
 *
 * ```ts
 * SwaggerModule.register({
 *   path: '/api/docs',
 *   title: 'My API',
 *   auth: true,
 * })
 * ```
 */
@Module({})
export class SwaggerModule {
  static register(options: SwaggerOptions = {}): DynamicModule {
    return {
      module: SwaggerModule,
      providers: [
        {
          provide: SWAGGER_OPTIONS,
          useValue: options,
        },
      ],
      exports: [SWAGGER_OPTIONS],
    };
  }
}

export { SWAGGER_OPTIONS };
