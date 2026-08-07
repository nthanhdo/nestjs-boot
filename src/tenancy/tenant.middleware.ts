import { Inject, Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TENANCY_OPTIONS } from './constants';
import { runWithTenant } from './tenant-context';
import type { TenancyOptions } from './interfaces';

/**
 * TenantMiddleware — extracts tenant ID from each request and stores it
 * in AsyncLocalStorage so any downstream service can call getTenantId().
 *
 * Tenant extraction order:
 * 1. options.resolver (custom fn) if provided
 * 2. Built-in strategy: 'header' | 'subdomain' | 'path'
 *
 * Rejects with 401 if no tenant ID can be resolved.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @Inject(TENANCY_OPTIONS) private readonly options: TenancyOptions,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantId = this.extract(req);

    if (!tenantId) {
      throw new UnauthorizedException('Missing or invalid tenant identifier');
    }

    // Attach to request for guards/decorators that read from req
    (req as any).tenantId = tenantId;

    // Run the rest of the request pipeline inside the tenant async context
    runWithTenant(tenantId, () => next());
  }

  private extract(req: Request): string | null {
    // 1. Custom resolver takes precedence
    if (this.options.resolver) {
      return this.options.resolver(req) ?? null;
    }

    // 2. Built-in strategies
    switch (this.options.strategy) {
      case 'header': {
        const headerName = (this.options.headerName ?? 'X-Tenant-ID').toLowerCase();
        return (req.headers[headerName] as string) || null;
      }

      case 'subdomain': {
        const host = req.hostname ?? '';
        // 'acme.api.example.com' → 'acme'; 'api.example.com' → null
        const parts = host.split('.');
        return parts.length >= 3 ? parts[0] : null;
      }

      case 'path': {
        // '/acme/products' → 'acme'
        const segments = req.path.split('/').filter(Boolean);
        return segments[0] ?? null;
      }

      default:
        return null;
    }
  }
}
