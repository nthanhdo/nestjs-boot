import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { VersioningOptions } from './interfaces';
import { VERSIONING_OPTIONS } from './constants';
import { VersionInterceptor } from './version.interceptor';

export type { VersioningOptions };

/**
 * VersioningModule — auto-configure API versioning for a NestJS application.
 *
 * Usage in createApp() (handled automatically when `versioning` is in BootOptions):
 * ```ts
 * const app = await createApp(AppModule, {
 *   versioning: { type: 'uri', defaultVersion: '1' },
 * });
 * ```
 *
 * The module:
 * 1. Provides resolved options to the DI container via VERSIONING_OPTIONS token.
 * 2. Registers VersionInterceptor globally (adds X-API-Version response header,
 *    Sunset/Deprecation headers for @DeprecatedVersion routes).
 *
 * NestJS enableVersioning() must be called on the app instance AFTER createApp()
 * returns. createApp() calls it automatically when this module is active.
 *
 * Strategies:
 * - 'uri'        → /v1/products (default — zero client config needed)
 * - 'header'     → X-API-Version request header
 * - 'media-type' → Accept: application/json;version=1
 */
@Global()
@Module({})
export class VersioningModule {
  /**
   * Register versioning with the given options.
   *
   * @param options VersioningOptions (all fields optional — sensible defaults apply)
   */
  static register(options: VersioningOptions = {}): DynamicModule {
    const resolved: Required<VersioningOptions> = {
      type: options.type ?? 'uri',
      defaultVersion: options.defaultVersion ?? '1',
      header: options.header ?? 'X-API-Version',
      mediaTypeKey: options.mediaTypeKey ?? 'version',
    };

    const providers: Provider[] = [
      {
        provide: VERSIONING_OPTIONS,
        useValue: resolved,
      },
      {
        provide: APP_INTERCEPTOR,
        useClass: VersionInterceptor,
      },
    ];

    return {
      module: VersioningModule,
      global: true,
      providers,
      exports: [VERSIONING_OPTIONS],
    };
  }

  /**
   * Return the NestJS VersioningType enum value for the given strategy string.
   * Used by createApp() to call app.enableVersioning().
   */
  static getNestVersioningType(
    type: 'uri' | 'header' | 'media-type',
  ): import('@nestjs/common').VersioningType {
    const { VersioningType } = require('@nestjs/common');
    switch (type) {
      case 'header':
        return VersioningType.HEADER;
      case 'media-type':
        return VersioningType.MEDIA_TYPE;
      case 'uri':
      default:
        return VersioningType.URI;
    }
  }
}
