import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { IdempotencyGuard } from './idempotency.guard';

export const IDEMPOTENT_KEY = 'idempotent';
export const IDEMPOTENT_TTL_KEY = 'idempotent:ttl';

/**
 * @Idempotent(ttl?) — marks a route as idempotent.
 *
 * Reads the `Idempotency-Key` header from the request.
 * If the same key was seen before (within TTL), returns the cached response.
 * If the key is new, processes the request and caches the response.
 *
 * ```ts
 * @Post('charge')
 * @Idempotent(3600) // cache for 1 hour
 * async charge(@Body() dto: ChargeDto) { ... }
 * ```
 *
 * @param ttl - Cache duration in seconds (default: 86400 = 24h)
 */
export function Idempotent(ttl = 86400) {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),
    SetMetadata(IDEMPOTENT_TTL_KEY, ttl),
    UseGuards(IdempotencyGuard),
  );
}
