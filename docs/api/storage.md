# Storage API Reference

> Unified file storage abstraction supporting local filesystem, AWS S3, and Google Cloud Storage with MIME validation, pre-signed URLs, and a consistent adapter interface.

## Module Registration

```ts
import { StorageModule } from 'nestjs-boot';

// Local filesystem
StorageModule.register({
  driver: 'local',
  local: { uploadDir: '/var/uploads', basePath: '/uploads' },
  maxFileSize: 5_000_000,
  allowedMimeTypes: ['image/*', 'application/pdf'],
})

// AWS S3
StorageModule.register({
  driver: 's3',
  s3: { bucket: 'my-bucket', region: 'us-east-1', publicRead: true },
  maxFileSize: 10_000_000,
})

// Google Cloud Storage
StorageModule.register({
  driver: 'gcs',
  gcs: { bucket: 'my-bucket', projectId: 'my-project', keyFilename: '/run/secrets/gcs-key.json' },
})
```

S3 and GCS adapters are loaded dynamically — if the required peer package is not installed, `StorageModule.register()` throws with an install hint.

---

## Classes

### `StorageModule`

`@Module`

#### Static Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(options: StorageModuleOptions): DynamicModule` | Register the storage system. Instantiates the correct adapter based on `options.driver` and exports `StorageService` under both the class token and `STORAGE_SERVICE`. |

---

### `StorageService`

`@Injectable()`

Unified file storage service that validates files before delegating to the configured adapter.

#### Constructor

```ts
constructor(
  @Inject(STORAGE_ADAPTER) adapter: StorageAdapter,
  @Inject(STORAGE_OPTIONS) options: StorageModuleOptions,
)
```

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `upload` | `(file: UploadedFile): Promise<StorageResult>` | Validates MIME type and size against module options, then delegates to the adapter. Throws `BadRequestException` on validation failure. |
| `download` | `(key: string): Promise<Buffer>` | Download file contents by storage key. |
| `delete` | `(key: string): Promise<void>` | Delete a file by storage key. |
| `exists` | `(key: string): Promise<boolean>` | Check whether a file exists at the given key. |
| `getUrl` | `(key: string): Promise<string>` | Get the public URL for a storage key. |
| `getSignedUrl` | `(key: string, expiresIn?: number): Promise<string>` | Generate a pre-signed URL for temporary private access. Default expiry: 3600 seconds. |

---

### `LocalAdapter`

Stores files on the local filesystem. Prevents path traversal via `safePath()` (throws if the resolved path escapes `uploadDir`).

#### Constructor

```ts
constructor(uploadDir: string, basePath?: string, signingSecret?: string)
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `uploadDir` | — | Absolute directory where files are written. |
| `basePath` | `'/uploads'` | URL prefix used to construct public URLs. |
| `signingSecret` | — | Secret for HMAC-SHA256 signed URLs. Required to call `getSignedUrl`. |

**Signed URL format** (local only):
```
{basePath}/{key}?token={hmac-sha256}&expires={unix-timestamp}
```
The caller must implement token verification middleware that checks `expires` and recomputes the HMAC over `${key}:${expires}`.

---

### `S3Adapter`

Stores files in AWS S3 or any S3-compatible storage (MinIO, Localstack).

#### Constructor

```ts
constructor(options: {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;   // custom endpoint for MinIO / Localstack
  publicRead?: boolean;
})
```

Sets `forcePathStyle: true` automatically when `endpoint` is provided (required for MinIO/Localstack).

**Requires:** `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

---

### `GCSAdapter`

Stores files in Google Cloud Storage.

#### Constructor

```ts
constructor(options: {
  bucket: string;
  projectId: string;
  keyFilename?: string;  // path to service account JSON key file
})
```

**Requires:** `npm install @google-cloud/storage`

---

### `FileValidationPipe`

`@Injectable()` · `implements PipeTransform`

Validates file uploads **before** the upload occurs — rejects invalid files early to avoid wasting bandwidth and storage.

#### Constructor

```ts
constructor(validationOptions?: FileValidationOptions)
```

#### `transform(file, metadata)`

Returns the file unchanged if valid. Throws `BadRequestException` if:
- File is missing and `required: true` (default).
- MIME type does not match `mimeTypes`.
- File size exceeds `maxSize`.

**Usage:**

```ts
@UseInterceptors(FileInterceptor('file'))
@Post('upload')
async upload(
  @UploadedFile(
    new FileValidationPipe({ maxSize: 5_000_000, mimeTypes: ['image/*', 'application/pdf'] })
  )
  file: Express.Multer.File,
) {
  return this.storage.upload({
    originalName: file.originalname,
    buffer: file.buffer,
    mimetype: file.mimetype,
    size: file.size,
  });
}
```

---

## Decorators

### `@InjectStorage()`

Shorthand for `@Inject(STORAGE_ADAPTER)`.

```ts
constructor(@InjectStorage() private readonly storage: StorageService) {}
```

> Note: The underlying token is `STORAGE_ADAPTER`. For injecting `StorageService` directly, standard constructor injection also works since `StorageService` is exported by class token.

---

## Utility Functions

### `generateStorageKey(originalName: string, folder?: string): string`

Generates a unique storage key using UUIDv4 + the original file extension.

```
Format: {folder/}{uuid}{.ext}
Examples:
  generateStorageKey('photo.jpg')           → 'a1b2c3d4-...-uuid.jpg'
  generateStorageKey('photo.jpg', 'avatars') → 'avatars/a1b2c3d4-...-uuid.jpg'
```

---

### `matchesMimeType(mimetype: string, pattern: string): boolean`

Checks whether a MIME type matches a pattern. Supports wildcards.

```ts
matchesMimeType('image/png', 'image/*')          // true
matchesMimeType('image/png', '*')                // true
matchesMimeType('application/pdf', 'image/*')   // false
matchesMimeType('text/html', 'text/html')        // true
```

---

### `validateFile(mimetype: string, size: number, options): string | null`

Returns an error message string if the file is invalid, or `null` if valid.

```ts
function validateFile(
  mimetype: string,
  size: number,
  options: {
    allowedMimeTypes?: string[];
    maxFileSize?: number;  // default: 10 * 1024 * 1024 (10MB)
  },
): string | null
```

---

## Interfaces

### `UploadedFile`

```ts
interface UploadedFile {
  /** Original filename from the user */
  originalName: string;
  /** File contents as Buffer */
  buffer: Buffer;
  /** MIME type (e.g. 'image/png') */
  mimetype: string;
  /** File size in bytes */
  size: number;
  /** Optional subdirectory within the storage bucket/dir */
  folder?: string;
}
```

### `StorageResult`

```ts
interface StorageResult {
  /** Unique storage key — use for download/delete/exists/getUrl */
  key: string;
  /** Public URL */
  url: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimetype: string;
}
```

### `StorageAdapter`

The contract that all adapters implement. Use this to add custom storage backends.

```ts
interface StorageAdapter {
  upload(file: UploadedFile): Promise<StorageResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): Promise<string>;
  /** @param expiresIn - expiry in seconds (default: 3600) */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}
```

### `StorageModuleOptions`

```ts
interface StorageModuleOptions {
  driver: 'local' | 's3' | 'gcs';
  local?: {
    uploadDir: string;
    serveStatic?: boolean;
    basePath?: string;          // default: '/uploads'
  };
  s3?: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;          // MinIO / Localstack custom endpoint
    publicRead?: boolean;       // default: false
  };
  gcs?: {
    bucket: string;
    projectId: string;
    keyFilename?: string;
  };
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Allowed MIME types — supports wildcards like 'image/*' (default: all) */
  allowedMimeTypes?: string[];
}
```

### `FileValidationOptions`

```ts
interface FileValidationOptions {
  /** Maximum allowed file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Allowed MIME types — supports wildcards like 'image/*' */
  mimeTypes?: string[];
  /** Whether the file is required (default: true) */
  required?: boolean;
}
```

---

## Constants / Tokens

| Constant | Value | Purpose |
|----------|-------|---------|
| `STORAGE_SERVICE` | `'STORAGE_SERVICE'` | Injection token for `StorageService`. |
| `STORAGE_ADAPTER` | `'STORAGE_ADAPTER'` | Injection token for the active `StorageAdapter`. Also used by `@InjectStorage()`. |
| `STORAGE_OPTIONS` | `'STORAGE_OPTIONS'` | Injection token for `StorageModuleOptions`. |

---

## Optional Dependencies

| Package | Driver |
|---------|--------|
| `@aws-sdk/client-s3` | `s3` |
| `@aws-sdk/s3-request-presigner` | `s3` (signed URLs) |
| `@google-cloud/storage` | `gcs` |
