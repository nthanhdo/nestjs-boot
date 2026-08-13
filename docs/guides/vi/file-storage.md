# Lưu trữ file

`StorageModule` cung cấp lớp trừu tượng lưu trữ file thống nhất với các adapter cho hệ thống file cục bộ, AWS S3, và Google Cloud Storage, kèm xác thực file và bảo vệ path traversal.

## Cài đặt

### Hệ thống file cục bộ

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
    endpoint: 'http://localhost:4566', // tùy chọn: MinIO / Localstack
    publicRead: true,
  },
})
```

Yêu cầu: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

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

Yêu cầu: `npm install @google-cloud/storage`

## API StorageService

Inject qua constructor:

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

| Phương thức | Chữ ký | Mô tả |
|--------|-----------|-------------|
| `upload` | `(file: UploadedFile) => Promise<StorageResult>` | Upload với xác thực MIME/kích thước |
| `download` | `(key: string) => Promise<Buffer>` | Tải nội dung file |
| `delete` | `(key: string) => Promise<void>` | Xóa file |
| `exists` | `(key: string) => Promise<boolean>` | Kiểm tra file có tồn tại |
| `getUrl` | `(key: string) => Promise<string>` | Lấy URL công khai |
| `getSignedUrl` | `(key: string, expiresIn?: number) => Promise<string>` | Lấy URL ký có giới hạn thời gian |

Upload trả về `StorageResult`:

```ts
interface StorageResult {
  key: string;      // khóa lưu trữ duy nhất cho các thao tác tiếp theo
  url: string;      // URL công khai
  size: number;
  mimetype: string;
}
```

## FileValidationPipe

Xác thực file upload ở tầng controller trước khi chúng tới service:

```ts
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async upload(
  @UploadedFile(
    new FileValidationPipe({
      maxSize: 5_000_000,              // 5MB
      mimeTypes: ['image/*', 'application/pdf'],
      required: true,                   // mặc định: true
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

Khớp MIME type hỗ trợ wildcard: `image/*` khớp `image/png`, `image/jpeg`, v.v.

## Tạo Storage Key

File được lưu với key dựa trên UUID: `{folder}/{uuid}.{ext}`. Tên file gốc không bao giờ được dùng trong đường dẫn lưu trữ, ngăn chặn xung đột và injection.

## Bảo vệ Path Traversal

`LocalAdapter` sử dụng `safePath()` để phân giải key dựa trên thư mục upload. Bất kỳ key nào phân giải ra ngoài `uploadDir` (ví dụ: `../../etc/passwd`) sẽ ném lỗi ngay lập tức.

## URL ký

### S3 / GCS

Sử dụng tạo pre-signed URL gốc. Thời hạn mặc định: 3600 giây (1 giờ).

```ts
const url = await storage.getSignedUrl('avatars/abc.png', 900); // 15 phút
```

### Cục bộ

Yêu cầu `signingSecret` (tham số constructor thứ ba cho `LocalAdapter`). Tạo URL ký bằng HMAC-SHA256: `/uploads/{key}?token={hmac}&expires={timestamp}`. Bạn phải tự implement middleware xác minh trên file server tĩnh.

## Tham chiếu cấu hình

```ts
interface StorageModuleOptions {
  driver: 'local' | 's3' | 'gcs';
  local?: { uploadDir: string; serveStatic?: boolean; basePath?: string };
  s3?: { bucket: string; region: string; accessKeyId?: string; secretAccessKey?: string; endpoint?: string; publicRead?: boolean };
  gcs?: { bucket: string; projectId: string; keyFilename?: string };
  maxFileSize?: number;          // mặc định: 10MB
  allowedMimeTypes?: string[];   // mặc định: tất cả
}
```

## Thực hành tốt nhất

- Luôn đặt `maxFileSize` và `allowedMimeTypes` trong production để ngăn lạm dụng.
- Sử dụng `FileValidationPipe` ở controller để từ chối file không hợp lệ trước khi buffer toàn bộ upload.
- Sử dụng `folder` trong `UploadedFile` để tổ chức file theo domain (ví dụ: `avatars/`, `invoices/`).
- Cho phát triển cục bộ tương thích S3, sử dụng MinIO với `endpoint` và `forcePathStyle`.
- Ưu tiên `getSignedUrl` thay vì URL công khai cho file nhạy cảm.
- `key` trả về từ `upload` là handle cho tất cả thao tác tiếp theo; lưu nó vào database, không phải URL.
