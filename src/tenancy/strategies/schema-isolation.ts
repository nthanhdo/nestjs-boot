/**
 * SchemaIsolation strategy — shared MongoDB database, collection-name prefix per tenant.
 *
 * Each tenant's documents land in dedicated collections:
 *   tenant_{tenantId}_products, tenant_{tenantId}_orders, ...
 *
 * Trade-offs:
 * ✅ Stronger logical isolation than row-level (no risk of cross-tenant query bleed).
 * ✅ All tenants share one MongoDB connection pool.
 * ✅ Easy backup/export per tenant (collection filter).
 * ⚠️ Collection count grows with tenants × models — MongoDB has no hard limit but
 *    large numbers (>10 000) can impact WiredTiger catalog performance.
 * ⚠️ Cross-tenant queries require explicit multi-collection aggregation ($unionWith).
 * ⚠️ Indexes must be created per-collection (per tenant) — automate with ensureIndexes().
 *
 * Recommended: when you want no-code data isolation without per-tenant DB connections.
 */
export class SchemaIsolation {
  readonly type = 'schema' as const;

  constructor(private readonly prefix: string = 'tenant') {}

  /**
   * Return the collection name for a given base model name and tenant.
   * e.g. getCollectionName('orders', 'acme') → 'tenant_acme_orders'
   */
  getCollectionName(baseCollection: string, tenantId: string): string {
    return `${this.prefix}_${tenantId}_${baseCollection}`;
  }
}
