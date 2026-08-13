# File Storage

`StorageModule` provides a unified file storage abstraction with local filesystem, AWS S3, and Google Cloud Storage adapters, plus file validation and path traversal protection.

## Setup

### Local Filesystem

```ts
import { StorageModule } from 'nestjs-boot/storage';

@Module({
  imports: [
    StorageModule.register({
      driver: 'local',
      local: { uploadDir: '/tmp/uploads', basePath: '/uploads' },
      maxFileSize: 5_000_000,
      allowedMimeTypes: ['image/*', 'application/pdf'],
    }),
  ],
})
export class AppModule {}
```

### AWS S3

```ts
StorageModule.register({
  driver: 's3',
  s3: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: 'http://localhost:4566', // optional: MinIO / Localstack
    publicRead: true,
  },
})
```

Requires: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

### Google Cloud Storage

```ts
StorageModule.register({
  driver: 'gcs',
  gcs: {
    bucket: 'my-bucket',
    projectId: 'my-project',
    keyFilename: '/path/to/service-account.json',
  },
})
```

Requires: `npm install @google-cloud/storage`

## StorageService API

Inject via constructor:

```ts
import { StorageService } from 'nestjs-boot/storage';

@Injectable()
export class MediaService {
  constructor(private readonly storage: StorageService) {}

  async uploadAvatar(file: Express.Multer.File) {
    return this.storage.upload({
      originalName: file.originalname,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      folder: 'avatars',
    });
  }
}
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `upload` | `(file: UploadedFile) => Promise<StorageResult>` | Upload with MIME/size validation |
| `download` | `(key: string) => Promise<Buffer>` | Download file contents |
| `delete` | `(key: string) => Promise<void>` | Delete a file |
| `exists` | `(key: string) => Promise<boolean>` | Check if file exists |
| `getUrl` | `(key: string) => Promise<string>` | Get public URL |
| `getSignedUrl` | `(key: string, expiresIn?: number) => Promise<string>` | Get time-limited signed URL |

Upload returns a `StorageResult`:

```ts
interface StorageResult {
  key: string;      // unique storage key for future operations
  url: string;      // public URL
  size: number;
  mimetype: string;
}
```

## FileValidationPipe

Validates file uploads at the controller level before they reach the service:

```ts
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async upload(
  @UploadedFile(
    new FileValidationPipe({
      maxSize: 5_000_000,              // 5MB
      mimeTypes: ['image/*', 'application/pdf'],
      required: true,                   // default: true
    }),
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

MIME type matching supports wildcards: `image/*` matches `image/png`, `image/jpeg`, etc.

## Storage Key Generation

Files are stored with UUID-based keys: `{folder}/{uuid}.{ext}`. The original filename is never used in the storage path, preventing collisions and injection.

## Path Traversal Protection

`LocalAdapter` uses `safePath()` to resolve keys against the upload directory. Any key that resolves outside `uploadDir` (e.g., `../../etc/passwd`) throws an error immediately.

## Signed URLs

### S3 / GCS

Uses native pre-signed URL generation. Default expiry: 3600 seconds (1 hour).

```ts
const url = await storage.getSignedUrl('avatars/abc.png', 900); // 15 minutes
```

### Local

Requires a `signingSecret` (third constructor argument to `LocalAdapter`). Generates HMAC-SHA256 signed URLs: `/uploads/{key}?token={hmac}&expires={timestamp}`. You must implement verification middleware on your static file server.

## Configuration Reference

```ts
interface StorageModuleOptions {
  driver: 'local' | 's3' | 'gcs';
  local?: { uploadDir: string; serveStatic?: boolean; basePath?: string };
  s3?: { bucket: string; region: string; accessKeyId?: string; secretAccessKey?: string; endpoint?: string; publicRead?: boolean };
  gcs?: { bucket: string; projectId: string; keyFilename?: string };
  maxFileSize?: number;          // default: 10MB
  allowedMimeTypes?: string[];   // default: all
}
```

## Best Practices

- Always set `maxFileSize` and `allowedMimeTypes` in production to prevent abuse.
- Use `FileValidationPipe` at the controller to reject invalid files before buffering the full upload.
- Use `folder` in `UploadedFile` to organize files by domain (e.g., `avatars/`, `invoices/`).
- For S3-compatible local development, use MinIO with `endpoint` and `forcePathStyle`.
- Prefer `getSignedUrl` over public URLs for sensitive files.
- The `key` returned from `upload` is the handle for all subsequent operations; store it in your database, not the URL.
