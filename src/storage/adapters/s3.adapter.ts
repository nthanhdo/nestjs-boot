import { StorageAdapter, UploadedFile, StorageResult } from '../storage.interface';
import { generateStorageKey } from '../storage.utils';

/**
 * S3Adapter — stores files in AWS S3 (or S3-compatible storage: MinIO, Localstack).
 *
 * Requires optional dependency: @aws-sdk/client-s3
 * Install: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
 */
export class S3Adapter implements StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicRead: boolean;
  private readonly endpoint?: string;

  constructor(options: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    publicRead?: boolean;
  }) {
    this.bucket = options.bucket;
    this.region = options.region;
    this.publicRead = options.publicRead ?? false;
    this.endpoint = options.endpoint;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { S3Client } = require('@aws-sdk/client-s3');
      const clientConfig: Record<string, unknown> = { region: this.region };
      if (options.accessKeyId && options.secretAccessKey) {
        clientConfig['credentials'] = {
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
        };
      }
      if (options.endpoint) {
        clientConfig['endpoint'] = options.endpoint;
        clientConfig['forcePathStyle'] = true; // required for MinIO / Localstack
      }
      this.client = new S3Client(clientConfig);
    } catch {
      throw new Error(
        'S3Adapter requires @aws-sdk/client-s3. Install it: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner',
      );
    }
  }

  async upload(file: UploadedFile): Promise<StorageResult> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = generateStorageKey(file.originalName, file.folder);

    const params: Record<string, unknown> = {
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    if (this.publicRead) {
      params['ACL'] = 'public-read';
    }

    await this.client.send(new PutObjectCommand(params));

    return {
      key,
      url: await this.getUrl(key),
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async download(key: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(key: string): Promise<string> {
    if (this.endpoint) {
      return `${this.endpoint}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }
}
