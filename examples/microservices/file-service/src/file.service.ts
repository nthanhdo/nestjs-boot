import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FileDocument } from './schemas/file.schema';
import { FileStorageService } from './file-storage.service';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    @InjectModel('File') private readonly fileModel: Model<FileDocument>,
    private readonly storage: FileStorageService,
  ) {}

  async upload(data: {
    filename: string;
    mimetype: string;
    data: Buffer;
    uploadedBy: string;
    folder: string;
  }): Promise<FileDocument> {
    const buffer = Buffer.isBuffer(data.data)
      ? data.data
      : Buffer.from(data.data as any, 'base64');

    const { filename, path } = this.storage.save(data.filename, buffer, data.folder);

    const file = new this.fileModel({
      filename,
      originalName: data.filename,
      mimetype: data.mimetype,
      size: buffer.length,
      path,
      url: '', // will be set after save to get the _id
      folder: data.folder || '',
      uploadedBy: data.uploadedBy || '',
    });

    const saved = await file.save();
    saved.url = this.storage.getUrl(saved._id!.toString(), saved.filename);
    await saved.save();

    this.logger.log(`File uploaded: ${saved._id} "${saved.originalName}" (${saved.size} bytes)`);
    return saved;
  }

  async findOne(id: string): Promise<FileDocument> {
    const file = await this.fileModel.findById(id).exec();
    if (!file) {
      throw new NotFoundException(`File ${id} not found`);
    }
    return file;
  }

  async delete(id: string): Promise<boolean> {
    const file = await this.fileModel.findById(id).exec();
    if (!file) {
      throw new NotFoundException(`File ${id} not found`);
    }

    this.storage.delete(file.path);
    await this.fileModel.findByIdAndDelete(id).exec();
    this.logger.log(`File deleted: ${id} "${file.originalName}"`);
    return true;
  }

  async listFiles(
    folder?: string,
    uploadedBy?: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: FileDocument[]; total: number }> {
    const filter: Record<string, any> = {};
    if (folder) filter.folder = folder;
    if (uploadedBy) filter.uploadedBy = uploadedBy;

    const skip = (Math.max(page, 1) - 1) * limit;

    const [items, total] = await Promise.all([
      this.fileModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(limit, 100))
        .exec(),
      this.fileModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }
}
