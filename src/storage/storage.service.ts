import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { StorageAdapter, UploadedFile, StorageResult, StorageModuleOptions } from './storage.interface';
import { STORAGE_ADAPTER, STORAGE_OPTIONS } from './storage.constants';
import { validateFile } from './storage.utils';

/**
 * StorageService — unified file storage service.
 *
 * Delegates to the configured adapter (local/S3/GCS).
 * Validates MIME type and file size before upload.
 *
 * Inject via @InjectStorage() or directly via DI token STORAGE_SERVICE.
 *
 * ```ts
 * @Injectable()
 * class UploadController {
 *   constructor(@InjectStorage() private readonly storage: StorageService) {}
 *
 *   @Post('upload')
 *   @UseInterceptors(FileInterceptor('file'))
 *   async upload(@UploadedFile(new FileValidationPipe({ maxSize: 5_000_000, mimeTypes: ['image/*'] })) file) {
 *     return this.storage.upload({ ...file, buffer: file.buffer });
 *   }
 * }
 * ```
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter,
    @Inject(STORAGE_OPTIONS) private readonly options: StorageModuleOptions,
  ) {}

  /**
   * Upload a file — validates MIME type and size before delegating to adapter.
   */
  async upload(file: UploadedFile): Promise<StorageResult> {
    const error = validateFile(file.mimetype, file.size, {
      allowedMimeTypes: this.options.allowedMimeTypes,
      maxFileSize: this.options.maxFileSize,
    });

    if (error) {
      throw new BadRequestException(error);
    }

    this.logger.debug(`Uploading ${file.originalName} (${file.size} bytes, ${file.mimetype})`);
    const result = await this.adapter.upload(file);
    this.logger.debug(`Uploaded to key: ${result.key}`);
    return result;
  }

  async download(key: string): Promise<Buffer> {
    return this.adapter.download(key);
  }

  async delete(key: string): Promise<void> {
    return this.adapter.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.adapter.exists(key);
  }

  async getUrl(key: string): Promise<string> {
    return this.adapter.getUrl(key);
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    return this.adapter.getSignedUrl(key, expiresIn);
  }
}
