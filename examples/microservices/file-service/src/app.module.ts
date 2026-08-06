import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { FileStorageService } from './file-storage.service';
import { File, FileSchema } from './schemas/file.schema';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: File.name, schema: FileSchema },
    ]),
  ],
  controllers: [FileController],
  providers: [FileService, FileStorageService],
})
export class AppModule {}
