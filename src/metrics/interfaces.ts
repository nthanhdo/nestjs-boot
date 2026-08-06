/**
 * Configuration options for the Prometheus metrics module.
 */
export interface MetricsOptions {
  /** Enable metrics endpoint (default: true) */
  enabled?: boolean;
  /** Path for the metrics endpoint (default: '/metrics') */
  path?: string;
  /** Prefix for all metric names (e.g. 'myapp_') */
  prefix?: string;
  /** Collect default Node.js process metrics (default: true) */
  defaultMetrics?: boolean;
}
