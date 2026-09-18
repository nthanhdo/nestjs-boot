import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PagesService } from './pages.service';

/**
 * PagesController — public-facing endpoints that render content.
 *
 * This is a business controller (not part of Content Service).
 * It demonstrates how your app consumes content entries.
 */
@ApiTags('Pages')
@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get('types')
  @ApiOperation({ summary: 'List all content types (for nav/sitemap)' })
  async listContentTypes() {
    return this.pagesService.getContentTypes();
  }

  @Get(':contentType')
  @ApiOperation({ summary: 'List published entries for a content type' })
  @ApiParam({ name: 'contentType', example: 'blog-post' })
  @ApiQuery({ name: 'locale', required: false, example: 'en' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  async listEntries(
    @Param('contentType') contentType: string,
    @Query('locale') locale?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.pagesService.listPublished(
      contentType,
      locale || 'en',
      page ? +page : 1,
      limit ? +limit : 10,
    );
  }

  @Get(':contentType/:slug')
  @ApiOperation({ summary: 'Get a single published entry by slug' })
  @ApiParam({ name: 'contentType', example: 'blog-post' })
  @ApiParam({ name: 'slug', example: 'getting-started-nestjs-boot' })
  @ApiQuery({ name: 'locale', required: false, example: 'en' })
  async getEntry(
    @Param('contentType') contentType: string,
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
  ) {
    return this.pagesService.getPageBySlug(contentType, slug, locale || 'en');
  }
}
