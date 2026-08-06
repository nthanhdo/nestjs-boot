import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { FileService } from './file.service';

interface UploadRequest {
  filename: string;
  mimetype: string;
  data: Buffer;
  uploadedBy: string;
  folder: string;
}

interface FileById {
  id: string;
}

interface ListFilesRequest {
  folder?: string;
  uploadedBy?: string;
  page?: number;
  limit?: number;
}

function toFileResponse(file: any) {
  return {
    id: file._id?.toString(),
    filename: file.filename,
    originalName: file.originalName,
    mimetype: file.mimetype,
    size: file.size,
    url: file.url,
    folder: file.folder,
    uploadedBy: file.uploadedBy,
    createdAt: file.createdAt?.toISOString?.() || file.createdAt,
  };
}

@Controller()
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @GrpcMethod('FileService', 'Upload')
  async upload(data: UploadRequest) {
    const file = await this.fileService.upload(data);
    return toFileResponse(file);
  }

  @GrpcMethod('FileService', 'GetFile')
  async getFile(data: FileById) {
    const file = await this.fileService.findOne(data.id);
    return toFileResponse(file);
  }

  @GrpcMethod('FileService', 'DeleteFile')
  async deleteFile(data: FileById) {
    const success = await this.fileService.delete(data.id);
    return { success };
  }

  @GrpcMethod('FileService', 'ListFiles')
  async listFiles(data: ListFilesRequest) {
    const result = await this.fileService.listFiles(
      data.folder,
      data.uploadedBy,
      data.page,
      data.limit,
    );
    return {
      items: result.items.map(toFileResponse),
      total: result.total,
    };
  }
}
