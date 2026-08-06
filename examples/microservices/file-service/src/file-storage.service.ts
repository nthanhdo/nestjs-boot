import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    this.baseUrl = process.env.FILE_BASE_URL || 'http://localhost:3005/files';
    this.ensureDir(this.uploadDir);
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      this.logger.log(`Created upload directory: ${dir}`);
    }
  }

  save(originalName: string, buffer: Buffer, folder: string): { filename: string; path: string } {
    const ext = path.extname(originalName);
    const filename = `${randomUUID()}${ext}`;

    const folderPath = folder
      ? path.join(this.uploadDir, folder)
      : this.uploadDir;
    this.ensureDir(folderPath);

    const filePath = path.join(folderPath, filename);
    fs.writeFileSync(filePath, buffer);
    this.logger.log(`Saved file: ${filePath} (${buffer.length} bytes)`);

    const relativePath = folder ? path.join(folder, filename) : filename;
    return { filename, path: relativePath };
  }

  delete(filePath: string): void {
    const fullPath = path.join(this.uploadDir, filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      this.logger.log(`Deleted file: ${fullPath}`);
    }
  }

  getUrl(fileId: string, filename: string): string {
    return `${this.baseUrl}/${fileId}/${filename}`;
  }
}
