import { AsyncLocalStorage } from 'async_hooks';

/**
 * AsyncLocalStorage-based tenant context.
 *
 * This is a process-level singleton — one store shared across all requests,
 * each request gets its own "slot" via AsyncLocalStorage scoping.
 */
const store = new AsyncLocalStorage<{ tenantId: string }>();

/**
 * Get the current tenant ID for the active async context (request).
 * Returns undefined if called outside of a tenant-scoped request.
 */
export function getTenantId(): string | undefined {
  return store.getStore()?.tenantId;
}

/**
 * Run a callback within a tenant context.
 * Used by TenantMiddleware to scope each request.
 *
 * @internal
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return store.run({ tenantId }, fn);
}

/**
 * TenantContext — exposed as an injectable service so consumers can call
 * getTenantId() via dependency injection without importing the module directly.
 */
export class TenantContext {
  /**
   * Returns the tenant ID for the current async context.
   * Throws if no tenant context is active (middleware not wired or route skipped).
   */
  getTenantId(): string {
    const id = getTenantId();
    if (!id) {
      throw new Error(
        '[nestjs-boot] No tenant context active. Ensure TenantMiddleware is applied ' +
          'and the route is within the tenanted path.',
      );
    }
    return id;
  }

  /**
   * Returns the tenant ID or undefined if no context is active.
   */
  getTenantIdOrUndefined(): string | undefined {
    return getTenantId();
  }
}
