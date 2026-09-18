import type { RagOptions } from './rag-options.interface';
import type { CdnOptions } from './cdn-options.interface';

export interface ContentModuleOptions {
  /**
   * Enable content service module.
   * When used via `.env`, set BOOT_SERVICES_CONTENT=true.
   */
  enabled?: boolean;

  /**
   * Enable Redis/Memcached caching for Delivery API responses.
   * Requires CacheModule to be configured.
   * @default false
   */
  enableCache?: boolean;

  /**
   * Enable full-text search via PostgreSQL tsvector + pg_trgm.
   * @default true
   */
  enableSearch?: boolean;

  /**
   * Enable webhook dispatching on content events.
   * @default true
   */
  enableWebhooks?: boolean;

  /**
   * Number of retry attempts for failed webhook deliveries.
   * @default 3
   */
  webhookRetryAttempts?: number;

  /**
   * Enable GraphQL endpoint for Delivery API.
   * Requires @nestjs/graphql + @nestjs/apollo peer dependencies.
   * @default false
   */
  graphql?: boolean;

  /**
   * Default locale code.
   * @default 'en'
   */
  defaultLocale?: string;

  /**
   * Supported locale codes.
   * @default ['en']
   */
  supportedLocales?: string[];

  /**
   * Management API route prefix.
   * @default '/api/content'
   */
  managementPrefix?: string;

  /**
   * Delivery API route prefix.
   * @default '/api/delivery'
   */
  deliveryPrefix?: string;

  /**
   * Default page size for list endpoints.
   * @default 25
   */
  defaultPageSize?: number;

  /**
   * Maximum populate depth for reference resolution.
   * @default 3
   */
  maxPopulateDepth?: number;

  /**
   * Cache TTL in seconds for Delivery API responses.
   * @default 300
   */
  cacheTtl?: number;

  /**
   * Scheduled publish check interval in milliseconds.
   * @default 60000 (1 minute)
   */
  scheduleCheckInterval?: number;

  /**
   * Max requests per API key per window for Delivery API.
   * @default 100
   */
  rateLimitMax?: number;

  /**
   * Rate limit window in milliseconds.
   * @default 60000 (1 minute)
   */
  rateLimitWindowMs?: number;

  /**
   * RAG (Retrieval-Augmented Generation) configuration.
   * Enables semantic search via pgvector embeddings.
   * Requires PostgreSQL with pgvector extension.
   */
  rag?: RagOptions;

  /**
   * CDN integration configuration.
   * Adds Cache-Control headers to Delivery API and auto-purges on publish.
   * Supports CloudFront, Cloudflare, or custom webhook.
   */
  cdn?: CdnOptions;
}
