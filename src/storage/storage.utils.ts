import { extname } from 'path';
import { randomUUID } from 'crypto';

/**
 * Generate a unique storage key for a file.
 * Format: `{folder/}{uuid}{.ext}`
 */
export function generateStorageKey(originalName: string, folder?: string): string {
  const ext = extname(originalName).toLowerCase();
  const uuid = randomUUID();
  const filename = `${uuid}${ext}`;
  return folder ? `${folder.replace(/\/+$/, '')}/${filename}` : filename;
}

/**
 * Check whether a MIME type matches a pattern.
 * Supports wildcards like 'image/*'.
 */
export function matchesMimeType(mimetype: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '*/*') return true;
  if (pattern.endsWith('/*')) {
    const category = pattern.slice(0, -2);
    return mimetype.startsWith(`${category}/`);
  }
  return mimetype === pattern;
}

/**
 * Validate a file against allowed MIME types and max size.
 * Returns an error message string, or null if valid.
 */
export function validateFile(
  mimetype: string,
  size: number,
  options: {
    allowedMimeTypes?: string[];
    maxFileSize?: number;
  },
): string | null {
  const maxSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB default
  if (size > maxSize) {
    return `File size ${size} bytes exceeds maximum allowed ${maxSize} bytes`;
  }

  if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
    const allowed = options.allowedMimeTypes.some((pattern) =>
      matchesMimeType(mimetype, pattern),
    );
    if (!allowed) {
      return `MIME type "${mimetype}" is not allowed. Allowed: ${options.allowedMimeTypes.join(', ')}`;
    }
  }

  return null;
}
