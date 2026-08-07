/**
 * File to upload — passed to StorageAdapter.upload().
 */
export interface UploadedFile {
  /** Original filename from the user */
  originalName: string;
  /** File contents as Buffer */
  buffer: Buffer;
  /** MIME type, e.g. 'image/png' */
  mimetype: string;
  /** File size in bytes */
  size: number;
  /** Optional subdirectory within the storage bucket/dir */
  folder?: string;
}

/**
 * Result of a successful upload.
 */
export interface StorageResult {
  /** Unique storage key — used for download/delete/exists/getUrl */
  key: string;
  /** Public URL (for local: served URL; for S3/GCS: public object URL) */
  url: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimetype: string;
}

/**
 * Unified storage adapter interface.
 * Implement this to add new storage backends.
 */
export interface StorageAdapter {
  upload(file: UploadedFile): Promise<StorageResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): Promise<string>;
  /**
   * Generate a pre-signed URL for temporary private access.
   * @param key - storage key
   * @param expiresIn - expiry in seconds (default: 3600)
   */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

/**
 * Options for StorageModule.register().
 */
export interface StorageModuleOptions {
  driver: 'local' | 's3' | 'gcs';
  local?: {
    /** Directory to store uploaded files */
    uploadDir: string;
    /** Serve files as static assets (requires static middleware setup) */
    serveStatic?: boolean;
    /** Base URL path for served files (default: '/uploads') */
    basePath?: string;
  };
  s3?: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    /** Custom endpoint URL (for localstack, minio, etc.) */
    endpoint?: string;
    /** Make uploaded objects publicly accessible (default: false) */
    publicRead?: boolean;
  };
  gcs?: {
    bucket: string;
    projectId: string;
    keyFilename?: string;
  };
  /** Maximum allowed file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Allowed MIME types — supports wildcards like 'image/*' (default: all) */
  allowedMimeTypes?: string[];
}
