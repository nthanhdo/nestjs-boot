import { SetMetadata, Version } from '@nestjs/common';
import { DEPRECATED_VERSION_KEY } from './constants';

/**
 * @ApiVersion('2') — marks a controller or route handler for a specific API version.
 *
 * This is a thin alias over NestJS built-in @Version() to keep the naming
 * consistent with nestjs-boot conventions.
 *
 * ```ts
 * @Controller('products')
 * @ApiVersion('2')
 * export class ProductsV2Controller {}
 *
 * // Or per-route:
 * @Get()
 * @ApiVersion('1')
 * findAllV1() {}
 * ```
 */
export const ApiVersion = (version: string | string[]) => Version(version);

/**
 * @DeprecatedVersion(sunset) — marks a controller or route as deprecated.
 *
 * The VersionInterceptor will add `Sunset` and `Deprecation: true` headers
 * to every response from this endpoint.
 *
 * ```ts
 * @Controller('products')
 * @ApiVersion('1')
 * @DeprecatedVersion('2026-12-31')
 * export class ProductsV1Controller {}
 * ```
 *
 * @param sunset ISO 8601 date string when this version will be removed (e.g. '2026-12-31')
 */
export const DeprecatedVersion = (sunset: string) =>
  SetMetadata(DEPRECATED_VERSION_KEY, sunset);
