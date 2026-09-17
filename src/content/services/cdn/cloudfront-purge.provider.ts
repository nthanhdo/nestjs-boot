import { Logger } from '@nestjs/common';
import type { CdnPurgeProvider } from './cdn-purge-provider.interface';
import type { CdnOptions } from '../../interfaces/cdn-options.interface';

/**
 * AWS CloudFront cache purge provider.
 * Uses @aws-sdk/client-cloudfront (already an optional peer dep).
 */
export class CloudFrontPurgeProvider implements CdnPurgeProvider {
  private readonly logger = new Logger(CloudFrontPurgeProvider.name);
  private client: any;

  constructor(private readonly options: CdnOptions) {}

  private async getClient(): Promise<any> {
    if (!this.client) {
      try {
        const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
        this.client = {
          cf: new CloudFrontClient({
            region: this.options.cloudfrontRegion ?? 'us-east-1',
            ...(this.options.cloudfrontAccessKeyId ? {
              credentials: {
                accessKeyId: this.options.cloudfrontAccessKeyId,
                secretAccessKey: this.options.cloudfrontSecretAccessKey!,
              },
            } : {}),
          }),
          CreateInvalidationCommand,
        };
      } catch {
        throw new Error('CDN: @aws-sdk/client-cloudfront is required for CloudFront provider. Install: npm i @aws-sdk/client-cloudfront');
      }
    }
    return this.client;
  }

  async purgePaths(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { cf, CreateInvalidationCommand } = await this.getClient();

    const command = new CreateInvalidationCommand({
      DistributionId: this.options.cloudfrontDistributionId,
      InvalidationBatch: {
        CallerReference: `content-purge-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths.map((p) => (p.startsWith('/') ? p : `/${p}`)),
        },
      },
    });

    try {
      await cf.send(command);
      this.logger.log(`CloudFront: purged ${paths.length} paths`);
    } catch (err) {
      this.logger.error(`CloudFront purge failed: ${err}`);
      throw err;
    }
  }

  async purgeAll(): Promise<void> {
    return this.purgePaths(['/*']);
  }
}
