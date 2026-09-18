import { Module } from '@nestjs/common';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

/**
 * PagesModule — business module that consumes Content Service.
 *
 * Renders pages by fetching published content entries via
 * ContentEntryService (auto-registered by Content module).
 */
@Module({
  controllers: [PagesController],
  providers: [PagesService],
})
export class PagesModule {}
