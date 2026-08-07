import { join, extname, basename } from 'path';
import { StorageAdapter, UploadedFile, StorageResult } from '../storage.interface';
import { generateStorageKey } from '../storage.utils';

/**
 * LocalAdapter — stores files on the local filesystem.
 *
 * Files are written to `uploadDir/key`. The public URL is constructed
 * from `basePath/key` — mount a static file server at `basePath` to serve them.
 */
export class LocalAdapter implements StorageAdapter {
  private readonly uploadDir: string;
  private readonly basePath: string;

  constructor(uploadDir: string, basePath = '/uploads') {
    this.uploadDir = uploadDir;
    this.basePath = basePath;
  }

  async upload(file: UploadedFile): Promise<StorageResult> {
    const { mkdir, writeFile } = await import('fs/promises');
    const key = generateStorageKey(file.originalName, file.folder);
    const dest = join(this.uploadDir, key);

    // Ensure parent directory exists
    const { dirname } = await import('path');
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.buffer);

    return {
      key,
      url: `${this.basePath}/${key}`,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async download(key: string): Promise<Buffer> {
    const { readFile } = await import('fs/promises');
    const filePath = join(this.uploadDir, key);
    return readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const { unlink } = await import('fs/promises');
    const filePath = join(this.uploadDir, key);
    await unlink(filePath);
  }

  async exists(key: string): Promise<boolean> {
    const { access } = await import('fs/promises');
    const filePath = join(this.uploadDir, key);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(key: string): Promise<string> {
    return `${this.basePath}/${key}`;
  }

  /**
   * Local adapter doesn't have native signed URLs.
   * Returns a plain URL with an `expires` query param as a best-effort stub.
   */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    return `${this.basePath}/${key}?expires=${expires}`;
  }
}

// re-export for convenience
export { extname, basename };
