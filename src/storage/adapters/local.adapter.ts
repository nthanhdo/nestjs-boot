import { resolve } from 'path';
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
  private readonly signingSecret?: string;

  constructor(uploadDir: string, basePath = '/uploads', signingSecret?: string) {
    this.uploadDir = uploadDir;
    this.basePath = basePath;
    this.signingSecret = signingSecret;
  }

  /** Resolve key to a safe absolute path within uploadDir. Throws on traversal. */
  private safePath(key: string): string {
    const resolved = resolve(this.uploadDir, key);
    if (!resolved.startsWith(resolve(this.uploadDir) + '/') && resolved !== resolve(this.uploadDir)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  async upload(file: UploadedFile): Promise<StorageResult> {
    const { mkdir, writeFile } = await import('fs/promises');
    const key = generateStorageKey(file.originalName, file.folder);
    const dest = this.safePath(key);

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
    const filePath = this.safePath(key);
    return readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const { unlink } = await import('fs/promises');
    const filePath = this.safePath(key);
    await unlink(filePath);
  }

  async exists(key: string): Promise<boolean> {
    const { access } = await import('fs/promises');
    const filePath = this.safePath(key);
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
   * Generates a time-limited signed URL for local file access.
   *
   * The URL includes an HMAC-SHA256 token and expiry timestamp:
   *   /files/{key}?token={hmac}&expires={timestamp}
   *
   * The caller MUST implement token verification middleware that:
   * 1. Checks `expires` is in the future
   * 2. Recomputes HMAC over `${key}:${expires}` with the same secret
   * 3. Compares token using timing-safe comparison
   *
   * If no signing secret is provided (via constructor), throws an error
   * to prevent fake URLs from being silently returned.
   */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!this.signingSecret) {
      throw new Error(
        'LocalAdapter.getSignedUrl() requires a signingSecret. ' +
          'Pass it as the 3rd constructor argument, and implement token verification middleware ' +
          'to validate the HMAC token on the serving endpoint.',
      );
    }
    const { createHmac } = await import('crypto');
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const token = createHmac('sha256', this.signingSecret)
      .update(`${key}:${expires}`)
      .digest('hex');
    return `${this.basePath}/${key}?token=${token}&expires=${expires}`;
  }
}

