/**
 * API Versioning configuration options.
 */
export interface VersioningOptions {
  /**
   * Versioning strategy:
   * - 'uri'        → /v1/products (default)
   * - 'header'     → X-API-Version: 1
   * - 'media-type' → Accept: application/json;version=1
   */
  type?: 'uri' | 'header' | 'media-type';
  /** Default API version when no version is specified (default: '1') */
  defaultVersion?: string;
  /** Header name for 'header' strategy (default: 'X-API-Version') */
  header?: string;
  /** Media type key for 'media-type' strategy (default: 'version') */
  mediaTypeKey?: string;
}
