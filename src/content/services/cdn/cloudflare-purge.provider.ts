import { Logger } from '@nestjs/common';
import type { CdnPurgeProvider } from './cdn-purge-provider.interface';
import type { CdnOptions } from '../../interfaces/cdn-options.interface';

/**
 * Cloudflare cache purge provider.
 * Uses native fetch — no SDK dependency.
 */
export class CloudflarePurgeProvider implements CdnPurgeProvider {
  private readonly logger = new Logger(CloudflarePurgeProvider.name);
  private readonly baseUrl: string;

  constructor(private readonly options: CdnOptions) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/zones/${options.cloudflareZoneId}/purge_cache`;
  }

  async purgePaths(paths: string[]): Promise<void> {
    if (!paths.length) return;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.cloudflareApiToken}`,
        },
        body: JSON.stringify({ files: paths }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Cloudflare purge failed (${response.status}): ${error}`);
        throw new Error(`Cloudflare purge failed: ${response.status}`);
      }

      this.logger.log(`Cloudflare: purged ${paths.length} paths`);
    } catch (err) {
      this.logger.error(`Cloudflare purge failed: ${err}`);
      throw err;
    }
  }

  async purgeAll(): Promise<void> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.cloudflareApiToken}`,
        },
        body: JSON.stringify({ purge_everything: true }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloudflare purge_all failed: ${response.status} ${error}`);
      }

      this.logger.log('Cloudflare: purged all cache');
    } catch (err) {
      this.logger.error(`Cloudflare purge_all failed: ${err}`);
      throw err;
    }
  }
}
