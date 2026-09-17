export interface CdnOptions {
  /** Enable CDN integration. @default false */
  enabled: boolean;

  /** CDN provider. */
  provider: 'cloudfront' | 'cloudflare' | 'custom';

  // --- CloudFront ---
  /** AWS CloudFront distribution ID. */
  cloudfrontDistributionId?: string;
  /** AWS access key for CloudFront API. Falls back to default AWS credentials. */
  cloudfrontAccessKeyId?: string;
  /** AWS secret key for CloudFront API. */
  cloudfrontSecretAccessKey?: string;
  /** AWS region. @default 'us-east-1' */
  cloudfrontRegion?: string;

  // --- Cloudflare ---
  /** Cloudflare zone ID. */
  cloudflareZoneId?: string;
  /** Cloudflare API token with cache purge permissions. */
  cloudflareApiToken?: string;

  // --- Custom ---
  /** Custom purge endpoint URL. Receives POST with { paths: string[] }. */
  customPurgeUrl?: string;
  /** Custom headers for purge requests. */
  customPurgeHeaders?: Record<string, string>;

  // --- Cache settings ---
  /** Default max-age for entry responses in seconds. @default 300 */
  defaultMaxAge?: number;
  /** Max-age for asset responses in seconds. @default 86400 */
  assetMaxAge?: number;
  /** Stale-while-revalidate window in seconds. @default 60 */
  staleWhileRevalidate?: number;
  /** Auto-purge CDN cache on publish/unpublish. @default true */
  purgeOnPublish?: boolean;
}
