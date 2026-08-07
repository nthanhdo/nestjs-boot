import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Static context fields added to every log line produced by BootLogger.
 *
 * These are auto-populated from the running environment and package.json.
 * Users can extend this via LoggingOptions.context when registering LoggingModule.
 *
 * Example output in every log line:
 * {
 *   "service": "my-service",
 *   "environment": "production",
 *   "version": "1.2.3",
 *   "region": "us-east-1",   ← user-provided extra context
 *   "team": "platform"       ← user-provided extra context
 * }
 */
export interface LogContext {
  /** Service name — auto-detected from package.json `name` or OTEL_SERVICE_NAME env */
  service?: string;
  /** NODE_ENV value (production | development | test | …) */
  environment?: string;
  /** Package version from package.json */
  version?: string;
  /** Any additional fields the user wants on every log line */
  [key: string]: unknown;
}

/** Cached singleton — resolved once, reused for the lifetime of the process */
let _resolvedContext: LogContext | undefined;

/**
 * Read package.json `name` and `version` from process.cwd() / up to 3 directories.
 * Returns empty strings if not found (graceful — never throws).
 */
function readPackageJson(): { name: string; version: string } {
  const candidates = [
    join(process.cwd(), 'package.json'),
    join(process.cwd(), '..', 'package.json'),
    join(process.cwd(), '..', '..', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf-8'));
      if (pkg.name || pkg.version) {
        return { name: pkg.name ?? '', version: pkg.version ?? '' };
      }
    } catch {
      // not found or not parseable — try next
    }
  }
  return { name: '', version: '' };
}

/**
 * Build the base log context from environment + package.json.
 * The result is cached for the process lifetime.
 *
 * @param extra - User-provided extra fields (from LoggingOptions.context)
 */
export function buildLogContext(extra?: Record<string, unknown>): LogContext {
  if (!_resolvedContext) {
    const pkg = readPackageJson();
    _resolvedContext = {
      service: process.env['OTEL_SERVICE_NAME'] ?? process.env['SERVICE_NAME'] ?? (pkg.name || undefined),
      environment: process.env['NODE_ENV'] ?? 'development',
      version: process.env['APP_VERSION'] ?? (pkg.version || undefined),
    };
    // Strip undefined values so they don't appear as "undefined" in JSON logs
    for (const key of Object.keys(_resolvedContext) as Array<keyof LogContext>) {
      if (_resolvedContext[key] === undefined) {
        delete _resolvedContext[key];
      }
    }
  }

  if (!extra || Object.keys(extra).length === 0) {
    return _resolvedContext;
  }

  // Merge: extra fields come after auto-detected fields, so auto-fields take precedence
  // for reserved keys (service, environment, version) but extra wins for everything else
  return { ...extra, ..._resolvedContext };
}

/**
 * Reset the cached context (primarily for testing — allows context to be rebuilt
 * with fresh env vars in each test).
 *
 * @internal
 */
export function resetLogContextCache(): void {
  _resolvedContext = undefined;
}
