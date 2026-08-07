/**
 * RowIsolation strategy — shared collections, tenantId field on every document.
 *
 * This is the DEFAULT and simplest isolation model:
 * - All tenants share the same MongoDB collections.
 * - Every document has a `tenantId` field.
 * - TenantAwareRepository auto-adds `{ tenantId }` to every query.
 *
 * Trade-offs:
 * ✅ Zero infrastructure overhead — no extra connections or databases.
 * ✅ Easiest to reason about; standard Mongoose patterns apply.
 * ✅ Cross-tenant analytics is easy (just remove the filter).
 * ⚠️ Index design must include tenantId as leading key for compound indexes.
 * ⚠️ A bug in the filter layer can expose cross-tenant data — test filter rigorously.
 *
 * Recommended: for most SaaS use cases with <1 000 tenants and moderate data volumes.
 */
export class RowIsolation {
  readonly type = 'row' as const;

  /**
   * Return the query filter suffix that scopes a query to a single tenant.
   */
  getTenantFilter(tenantId: string): Record<string, string> {
    return { tenantId };
  }

  /**
   * Return the document fields that must be set on create.
   */
  getTenantFields(tenantId: string): Record<string, string> {
    return { tenantId };
  }
}
