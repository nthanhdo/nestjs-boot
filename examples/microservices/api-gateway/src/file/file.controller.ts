import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { FileGateway } from './file.gateway';

class UploadFileDto {
  filename!: string;
  mimetype!: string;
  data!: string; // base64-encoded file data
  uploadedBy?: string;
  folder?: string;
}

@Controller('files')
export class FileController {
  constructor(private readonly fileGateway: FileGateway) {}

  @Post('upload')
  upload(@Body() dto: UploadFileDto) {
    return this.fileGateway.upload({
      filename: dto.filename,
      mimetype: dto.mimetype,
      data: Buffer.from(dto.data, 'base64'),
      uploadedBy: dto.uploadedBy || '',
      folder: dto.folder || '',
    });
  }

  @Get(':id')
  getFile(@Param('id') id: string) {
    return this.fileGateway.getFile(id);
  }

  @Delete(':id')
  deleteFile(@Param('id') id: string) {
    return this.fileGateway.deleteFile(id);
  }

  @Get()
  listFiles(
    @Query('folder') folder?: string,
    @Query('uploadedBy') uploadedBy?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.fileGateway.listFiles(
      folder,
      uploadedBy,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
