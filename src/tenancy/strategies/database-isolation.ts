/**
 * DatabaseIsolation strategy — each tenant gets their own MongoDB database.
 *
 * ⚠️ CONNECTION COST WARNING ⚠️
 * Each unique tenant that makes a request will open a NEW Mongoose connection
 * to a separate MongoDB database. This means:
 *
 * - N tenants active concurrently → N connection pools open simultaneously.
 * - MongoDB Atlas M10 supports ~500 connections; shared across N pools that
 *   each have a minPoolSize of 2 → hard ceiling of ~250 simultaneous tenants.
 * - Cold-tenant requests pay the connection handshake latency (~50–200ms).
 * - You MUST implement connection eviction (LRU cache, max TTL) for high
 *   tenant counts. The built-in cache here is unbounded — add eviction in prod.
 *
 * ✅ When to use:
 * - Regulatory/compliance requirements mandate physical data separation.
 * - Enterprise customers who need point-in-time restore at DB granularity.
 * - Tenant count is small and known in advance (<50 concurrent).
 *
 * ❌ When NOT to use:
 * - High tenant count (>100 concurrent) without a connection-pool proxy.
 * - Cost-sensitive deployments (Atlas bills per connection-minute).
 * - SMB SaaS with self-serve signup (unbounded tenant count).
 *
 * Recommended alternative: SchemaIsolation for compliance-adjacent needs,
 * or RowIsolation + MongoDB field-level encryption for most cases.
 */
export class DatabaseIsolation {
  readonly type = 'database' as const;

  /** In-memory connection cache (tenantId → Mongoose connection). Unbounded — add LRU in prod. */
  private readonly connections = new Map<string, unknown>();

  constructor(
    /** Factory that returns a writerUri for the given tenantId */
    private readonly uriFactory: (tenantId: string) => string,
  ) {}

  /**
   * Return (and lazily create) the Mongoose connection for a tenant.
   * Caller must pass the mongoose instance to avoid bundling it here.
   */
  async getConnection(tenantId: string, mongoose: any): Promise<unknown> {
    if (this.connections.has(tenantId)) {
      return this.connections.get(tenantId);
    }
    const uri = this.uriFactory(tenantId);
    const conn = await mongoose.createConnection(uri).asPromise();
    this.connections.set(tenantId, conn);
    return conn;
  }

  /**
   * Close and evict a tenant connection (e.g. on idle timeout).
   */
  async evict(tenantId: string): Promise<void> {
    const conn = this.connections.get(tenantId) as any;
    if (conn) {
      await conn.close();
      this.connections.delete(tenantId);
    }
  }

  /** Number of open connections. */
  get connectionCount(): number {
    return this.connections.size;
  }
}
