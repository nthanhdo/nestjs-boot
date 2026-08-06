import { Inject } from '@nestjs/common';
import { CACHE_SERVICE } from './constants';

/**
 * Inject the MultiCacheService instance.
 *
 * Usage:
 * ```ts
 * constructor(@InjectCache() private readonly cache: MultiCacheService) {}
 * ```
 */
export function InjectCache(): ParameterDecorator {
  return Inject(CACHE_SERVICE);
}
