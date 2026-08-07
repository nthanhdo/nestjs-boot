import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDEMPOTENT_KEY, IDEMPOTENT_TTL_KEY } from './idempotency.decorator';

interface CachedResponse {
  statusCode: number;
  body: unknown;
  expiresAt: number;
}

/**
 * IdempotencyGuard — short-circuits duplicate POST/PUT/PATCH requests.
 *
 * Reads `Idempotency-Key` header. If the key was seen before and the
 * cached response hasn't expired, writes the cached response directly
 * and returns false (halts the handler).
 *
 * Usage via decorator (recommended):
 * ```ts
 * @Idempotent(3600)
 * @Post('charge')
 * async charge() { ... }
 * ```
 *
 * Or directly:
 * ```ts
 * @UseGuards(IdempotencyGuard)
 * ```
 *
 * Cache backend: in-memory Map by default. Swap for Redis by replacing
 * the IDEMPOTENCY_CACHE provider in WebhookModule or your own module.
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);
  // Shared in-memory store — survives the lifetime of the module instance
  private static readonly cache = new Map<string, CachedResponse>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isIdempotent = this.reflector.get<boolean>(
      IDEMPOTENT_KEY,
      context.getHandler(),
    );

    // Only intercept if @Idempotent() was applied
    if (!isIdempotent) return true;

    const ttl = this.reflector.get<number>(IDEMPOTENT_TTL_KEY, context.getHandler()) ?? 86400;
    const http = context.switchToHttp();
    const req = http.getRequest<import('express').Request>();
    const res = http.getResponse<import('express').Response>();

    const method = req.method?.toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      // Idempotency only applies to mutating methods
      return true;
    }

    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) {
      // No key — let request through (guard is advisory, not blocking without key)
      return true;
    }

    const cached = IdempotencyGuard.cache.get(key);
    if (cached) {
      if (Date.now() < cached.expiresAt) {
        this.logger.debug(`Idempotency cache hit: ${key}`);
        res.status(cached.statusCode).json(cached.body);
        return false; // halt handler
      } else {
        // Expired — remove
        IdempotencyGuard.cache.delete(key);
      }
    }

    // Intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): import('express').Response => {
      IdempotencyGuard.cache.set(key, {
        statusCode: res.statusCode,
        body,
        expiresAt: Date.now() + ttl * 1000,
      });
      return originalJson(body);
    };

    return true;
  }
}
