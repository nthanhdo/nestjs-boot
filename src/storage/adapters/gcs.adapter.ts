import { StorageAdapter, UploadedFile, StorageResult } from '../storage.interface';
import { generateStorageKey } from '../storage.utils';

/**
 * GCSAdapter — stores files in Google Cloud Storage.
 *
 * Requires optional dependency: @google-cloud/storage
 * Install: `npm install @google-cloud/storage`
 */
export class GCSAdapter implements StorageAdapter {
   
  private bucket: any;
  private readonly bucketName: string;

  constructor(options: {
    bucket: string;
    projectId: string;
    keyFilename?: string;
  }) {
    this.bucketName = options.bucket;
    try {
       
      const { Storage } = require('@google-cloud/storage');
      const storageOptions: Record<string, unknown> = {
        projectId: options.projectId,
      };
      if (options.keyFilename) {
        storageOptions['keyFilename'] = options.keyFilename;
      }
      const storage = new Storage(storageOptions);
      this.bucket = storage.bucket(options.bucket);
    } catch {
      throw new Error(
        'GCSAdapter requires @google-cloud/storage. Install it: npm install @google-cloud/storage',
      );
    }
  }

  async upload(file: UploadedFile): Promise<StorageResult> {
    const key = generateStorageKey(file.originalName, file.folder);
    const gcsFile = this.bucket.file(key);

    await gcsFile.save(file.buffer, {
      metadata: { contentType: file.mimetype },
    });

    return {
      key,
      url: await this.getUrl(key),
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async download(key: string): Promise<Buffer> {
    const [contents] = await this.bucket.file(key).download();
    return contents as Buffer;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete();
  }

  async exists(key: string): Promise<boolean> {
    const [exists] = await this.bucket.file(key).exists();
    return exists as boolean;
  }

  async getUrl(key: string): Promise<string> {
    return `https://storage.googleapis.com/${this.bucketName}/${key}`;
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const [url] = await this.bucket.file(key).getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });
    return url as string;
  }
}
