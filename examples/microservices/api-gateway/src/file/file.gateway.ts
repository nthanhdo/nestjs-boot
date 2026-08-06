import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface FileResponse {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  folder: string;
  uploadedBy: string;
  createdAt: string;
}

interface FileListResponse {
  items: FileResponse[];
  total: number;
}

interface DeleteResponse {
  success: boolean;
}

interface FileServiceGrpc {
  upload(data: {
    filename: string;
    mimetype: string;
    data: Buffer;
    uploadedBy: string;
    folder: string;
  }): Observable<FileResponse>;
  getFile(data: { id: string }): Observable<FileResponse>;
  deleteFile(data: { id: string }): Observable<DeleteResponse>;
  listFiles(data: {
    folder?: string;
    uploadedBy?: string;
    page?: number;
    limit?: number;
  }): Observable<FileListResponse>;
}

@Injectable()
export class FileGateway implements OnModuleInit {
  private fileService!: FileServiceGrpc;

  constructor(
    @Inject('FILE_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.fileService = this.client.getService<FileServiceGrpc>('FileService');
  }

  upload(data: {
    filename: string;
    mimetype: string;
    data: Buffer;
    uploadedBy: string;
    folder: string;
  }): Observable<FileResponse> {
    return this.fileService.upload(data);
  }

  getFile(id: string): Observable<FileResponse> {
    return this.fileService.getFile({ id });
  }

  deleteFile(id: string): Observable<DeleteResponse> {
    return this.fileService.deleteFile({ id });
  }

  listFiles(
    folder?: string,
    uploadedBy?: string,
    page = 1,
    limit = 20,
  ): Observable<FileListResponse> {
    return this.fileService.listFiles({ folder, uploadedBy, page, limit });
  }
}
