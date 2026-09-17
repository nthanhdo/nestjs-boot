import { Injectable, Inject, Logger } from '@nestjs/common';
import { CONTENT_MODULE_OPTIONS } from '../../constants';
import type { ContentModuleOptions } from '../../interfaces/content-options.interface';
import type { CdnPurgeProvider } from './cdn-purge-provider.interface';
import { CloudFrontPurgeProvider } from './cloudfront-purge.provider';
import { CloudflarePurgeProvider } from './cloudflare-purge.provider';

@Injectable()
export class CdnPurgeService {
  private readonly logger = new Logger(CdnPurgeService.name);
  private readonly provider: CdnPurgeProvider;
  private readonly deliveryPrefix: string;

  constructor(@Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions) {
    const cdn = options.cdn!;
    this.deliveryPrefix = options.deliveryPrefix ?? '/api/delivery';

    switch (cdn.provider) {
      case 'cloudfront':
        this.provider = new CloudFrontPurgeProvider(cdn);
        break;
      case 'cloudflare':
        this.provider = new CloudflarePurgeProvider(cdn);
        break;
      case 'custom':
        this.provider = new CustomPurgeProvider(cdn);
        break;
      default:
        throw new Error(`CDN: unknown provider "${cdn.provider}"`);
    }

    this.logger.log(`CDN purge service initialized (provider: ${cdn.provider})`);
  }

  /**
   * Purge entry cache paths. Called on publish/unpublish.
   */
  async purgeEntry(slug?: string, _locale?: string): Promise<void> {
    if (!this.options.cdn?.purgeOnPublish) return;

    const paths: string[] = [
      `${this.deliveryPrefix}/entries*`,
    ];

    if (slug) {
      paths.push(`${this.deliveryPrefix}/entries/by-slug/${slug}*`);
    }

    try {
      await this.provider.purgePaths(paths);
    } catch (err) {
      this.logger.error(`CDN purge entry failed: ${err}`);
    }
  }

  /**
   * Purge asset cache. Called on asset upload/update/delete.
   */
  async purgeAsset(assetId: string): Promise<void> {
    if (!this.options.cdn?.purgeOnPublish) return;

    try {
      await this.provider.purgePaths([
        `${this.deliveryPrefix}/assets/${assetId}*`,
      ]);
    } catch (err) {
      this.logger.error(`CDN purge asset failed: ${err}`);
    }
  }

  /**
   * Purge all CDN cache.
   */
  async purgeAll(): Promise<void> {
    try {
      await this.provider.purgeAll();
    } catch (err) {
      this.logger.error(`CDN purge all failed: ${err}`);
    }
  }
}

/**
 * Custom webhook-based purge provider.
 */
class CustomPurgeProvider implements CdnPurgeProvider {
  private readonly logger = new Logger('CustomCdnPurge');

  constructor(private readonly options: { customPurgeUrl?: string; customPurgeHeaders?: Record<string, string> }) {}

  async purgePaths(paths: string[]): Promise<void> {
    if (!this.options.customPurgeUrl) return;

    const response = await fetch(this.options.customPurgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.options.customPurgeHeaders,
      },
      body: JSON.stringify({ paths }),
    });

    if (!response.ok) {
      throw new Error(`Custom CDN purge failed: ${response.status}`);
    }
    this.logger.log(`Custom: purged ${paths.length} paths`);
  }

  async purgeAll(): Promise<void> {
    return this.purgePaths(['/*']);
  }
}
