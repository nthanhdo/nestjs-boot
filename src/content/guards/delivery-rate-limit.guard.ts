import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter for the Delivery API.
 * Tracks requests per API key with a sliding window.
 *
 * For production with multiple instances, use Redis-based rate limiting
 * (e.g., @nestjs/throttler with Redis storage).
 */
@Injectable()
export class DeliveryRateLimitGuard implements CanActivate {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(@Inject(CONTENT_MODULE_OPTIONS) options: ContentModuleOptions) {
    this.maxRequests = options.rateLimitMax ?? 100;
    this.windowMs = options.rateLimitWindowMs ?? 60_000;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const key = (request.headers['x-api-key'] as string) ?? request.ip ?? 'anonymous';
    const now = Date.now();

    let entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, this.maxRequests - entry.count);
    response.setHeader('X-RateLimit-Limit', this.maxRequests);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > this.maxRequests) {
      throw new HttpException(
        { statusCode: 429, message: 'Too many requests', error: 'TooManyRequests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Periodic cleanup of expired entries
    if (this.store.size > 10000) {
      for (const [k, v] of this.store) {
        if (now >= v.resetAt) this.store.delete(k);
      }
    }

    return true;
  }
}
