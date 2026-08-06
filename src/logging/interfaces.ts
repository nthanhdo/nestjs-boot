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
}
