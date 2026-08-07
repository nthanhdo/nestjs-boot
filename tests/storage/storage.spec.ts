import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { LocalAdapter } from '../../src/storage/adapters/local.adapter';
import { validateFile, matchesMimeType } from '../../src/storage/storage.utils';
import { UploadedFile } from '../../src/storage/storage.interface';

// ─── 1. Local upload + download + delete ─────────────────────────────────────
describe('LocalAdapter', () => {
  let uploadDir: string;
  let adapter: LocalAdapter;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'storage-test-'));
    adapter = new LocalAdapter(uploadDir, '/uploads', 'test-signing-secret');
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('should upload a file and return a key + URL', async () => {
    const file: UploadedFile = {
      originalName: 'photo.jpg',
      buffer: Buffer.from('fake-image-data'),
      mimetype: 'image/jpeg',
      size: 15,
    };

    const result = await adapter.upload(file);

    expect(result.key).toMatch(/\.jpg$/);
    expect(result.url).toMatch(/^\/uploads\//);
    expect(result.size).toBe(15);
    expect(result.mimetype).toBe('image/jpeg');
    expect(await adapter.exists(result.key)).toBe(true);
  });

  it('should download uploaded file contents correctly', async () => {
    const content = Buffer.from('hello storage world');
    const file: UploadedFile = {
      originalName: 'hello.txt',
      buffer: content,
      mimetype: 'text/plain',
      size: content.length,
    };

    const result = await adapter.upload(file);
    const downloaded = await adapter.download(result.key);
    expect(downloaded.toString()).toBe('hello storage world');
  });

  it('should delete a file and return false for exists() afterwards', async () => {
    const file: UploadedFile = {
      originalName: 'to-delete.txt',
      buffer: Buffer.from('delete me'),
      mimetype: 'text/plain',
      size: 9,
    };

    const result = await adapter.upload(file);
    expect(await adapter.exists(result.key)).toBe(true);

    await adapter.delete(result.key);
    expect(await adapter.exists(result.key)).toBe(false);
  });

  it('should generate a signed URL with expiry query param', async () => {
    const file: UploadedFile = {
      originalName: 'signed.pdf',
      buffer: Buffer.from('%PDF fake'),
      mimetype: 'application/pdf',
      size: 9,
    };
    const result = await adapter.upload(file);
    const signedUrl = await adapter.getSignedUrl(result.key, 600);
    expect(signedUrl).toContain('token=');
    expect(signedUrl).toContain('expires=');
    expect(signedUrl).toContain(result.key);
  });

  it('should upload into a subdirectory when folder is specified', async () => {
    const file: UploadedFile = {
      originalName: 'avatar.png',
      buffer: Buffer.from('png data'),
      mimetype: 'image/png',
      size: 8,
      folder: 'avatars',
    };
    const result = await adapter.upload(file);
    expect(result.key).toMatch(/^avatars\//);
  });
});

// ─── 2. MIME validation — reject wrong type ───────────────────────────────────
describe('validateFile — MIME type rejection', () => {
  it('should reject a file with a disallowed MIME type', () => {
    const error = validateFile('application/x-executable', 100, {
      allowedMimeTypes: ['image/*', 'application/pdf'],
    });
    expect(error).toBeTruthy();
    expect(error).toContain('application/x-executable');
  });

  it('should accept a file matching a wildcard MIME pattern', () => {
    const error = validateFile('image/webp', 100, {
      allowedMimeTypes: ['image/*'],
    });
    expect(error).toBeNull();
  });
});

// ─── 3. File size rejection ───────────────────────────────────────────────────
describe('validateFile — file size rejection', () => {
  it('should reject a file exceeding maxFileSize', () => {
    const error = validateFile('image/png', 10_000_001, {
      maxFileSize: 10_000_000,
    });
    expect(error).toBeTruthy();
    expect(error).toContain('10000001');
  });

  it('should accept a file exactly at the size limit', () => {
    const error = validateFile('image/png', 10_000_000, {
      maxFileSize: 10_000_000,
    });
    expect(error).toBeNull();
  });
});
