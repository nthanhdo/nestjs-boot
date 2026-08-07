/**
 * Configuration options for the structured logging module.
 */
export interface LoggingOptions {
  /** Log level (default: 'info') */
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Pretty-print logs (default: NODE_ENV !== 'production') */
  pretty?: boolean;
  /** Paths to redact from log output (e.g. ['req.headers.authorization']) */
  redact?: string[];
  /**
   * Static context fields added to every log line.
   * Auto-populated: service (package.json name), environment (NODE_ENV), version (package.json version).
   * Use this to add extra fields like region, team, datacenter, etc.
   *
   * @example
   * LoggingModule.register({ context: { region: 'us-east-1', team: 'platform' } })
   */
  context?: Record<string, unknown>;
}
