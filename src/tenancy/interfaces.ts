import type { Request } from 'express';

/**
 * Multi-tenancy configuration options.
 */
export interface TenancyOptions {
  /**
   * Strategy for extracting the tenant ID from an incoming request:
   * - 'header'    → reads a request header (default: X-Tenant-ID)
   * - 'subdomain' → reads the first subdomain label (e.g. acme.api.example.com → 'acme')
   * - 'path'      → reads the first path segment (e.g. /acme/products → 'acme')
   */
  strategy: 'header' | 'subdomain' | 'path';
  /** Header name when strategy is 'header' (default: 'X-Tenant-ID') */
  headerName?: string;
  /**
   * Custom tenant resolver — overrides the built-in strategy.
   * Return null/undefined to signal "no tenant" (request will be rejected).
   */
  resolver?: (req: Request) => string | null | undefined;
  /**
   * Data isolation model:
   * - 'row'      → shared collections with `tenantId` field auto-filter (default, simplest)
   * - 'schema'   → shared DB, collection name prefix per tenant
   * - 'database' → separate MongoDB database per tenant (⚠️ connection-per-tenant overhead)
   */
  isolation: 'database' | 'schema' | 'row';
}
