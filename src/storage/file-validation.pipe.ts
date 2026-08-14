import { PipeTransform, Injectable, BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { validateFile } from './storage.utils';

export interface FileValidationOptions {
  /** Maximum allowed file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Allowed MIME types — supports wildcards like 'image/*' */
  mimeTypes?: string[];
  /** Whether the file is required (default: true) */
  required?: boolean;
}

/**
 * FileValidationPipe — validates file uploads BEFORE upload occurs.
 *
 * Rejects invalid files early (wrong MIME type, too large) so bandwidth
 * and storage aren't wasted.
 *
 * Usage with NestJS FileInterceptor:
 * ```ts
 * @UseInterceptors(FileInterceptor('file'))
 * @Post('upload')
 * async upload(
 *   @UploadedFile(
 *     new FileValidationPipe({ maxSize: 5_000_000, mimeTypes: ['image/*', 'application/pdf'] })
 *   ) file: Express.Multer.File,
 * ) {
 *   return this.storage.upload({
 *     originalName: file.originalname,
 *     buffer: file.buffer,
 *     mimetype: file.mimetype,
 *     size: file.size,
 *   });
 * }
 * ```
 */
@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private readonly validationOptions: FileValidationOptions = {}) {}

   
  transform(file: any | undefined, _metadata: ArgumentMetadata) {
    const required = this.validationOptions.required ?? true;

    if (!file) {
      if (required) {
        throw new BadRequestException('File is required');
      }
      return file;
    }

    const error = validateFile(file.mimetype, file.size, {
      allowedMimeTypes: this.validationOptions.mimeTypes,
      maxFileSize: this.validationOptions.maxSize,
    });

    if (error) {
      throw new BadRequestException(error);
    }

    return file;
  }
}
