/**
 * A ConfigSource is anything that can provide key-value config pairs asynchronously.
 *
 * Implement this interface to plug in any secret/config provider:
 * - AWS Secrets Manager
 * - HashiCorp Vault
 * - GCP Secret Manager
 * - Azure Key Vault
 * - A remote HTTP config server
 * - A local .env file
 *
 * Sources are merged in priority order via `mergeConfigs()`.
 */
export interface ConfigSource {
  /**
   * Human-readable name for this source (used in logs and error messages).
   */
  readonly name: string;

  /**
   * Load config values from this source.
   * Returns a flat or nested key-value record.
   * The returned values are merged into the overall config.
   */
  load(): Promise<Record<string, unknown>>;
}
