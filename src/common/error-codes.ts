/**
 * ErrorCodes — stable machine-readable error code registry.
 *
 * Use these constants as the `code` field in BootException to give clients
 * a stable identifier they can switch on — decoupled from human-readable
 * messages that may change across versions.
 *
 * ```ts
 * throw new BootException('Token has expired', {
 *   code: ErrorCodes.AUTH_TOKEN_EXPIRED,
 *   status: 401,
 * });
 * ```
 *
 * These are plain string constants (not enums) so they serialize cleanly
 * to JSON and survive tree-shaking / serialization across service boundaries.
 */
export const ErrorCodes = {
  // ── Auth ────────────────────────────────────────────────────────────────
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',

  // ── Database ─────────────────────────────────────────────────────────────
  DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  DB_DUPLICATE_KEY: 'DB_DUPLICATE_KEY',
  DB_VALIDATION_FAILED: 'DB_VALIDATION_FAILED',
  DB_NOT_FOUND: 'DB_NOT_FOUND',

  // ── Transport / RPC ───────────────────────────────────────────────────────
  TRANSPORT_TIMEOUT: 'TRANSPORT_TIMEOUT',
  TRANSPORT_UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
  TRANSPORT_CIRCUIT_OPEN: 'TRANSPORT_CIRCUIT_OPEN',

  // ── General ───────────────────────────────────────────────────────────────
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** Union type of all registered error codes. */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
