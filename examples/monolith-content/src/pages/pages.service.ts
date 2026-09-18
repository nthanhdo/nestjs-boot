import { Injectable } from '@nestjs/common';
import type { ContentEntryService, ContentTypeService } from 'nestjs-boot/content';

/**
 * PagesService — example business service that consumes Content Service.
 *
 * Since ContentModule is @Global(), its services are injectable anywhere
 * without explicit imports.
 */
@Injectable()
export class PagesService {
  constructor(
    private readonly entryService: ContentEntryService,
    private readonly typeService: ContentTypeService,
  ) {}

  /**
   * Get a published page by slug and locale.
   */
  async getPageBySlug(contentType: string, slug: string, locale = 'en') {
    // Resolve content type first
    const type = await this.typeService.findBySlug(contentType);
    if (!type) return null;

    // Find published entry
    const entries = await this.entryService.findAll({
      contentTypeId: type.id,
      status: 'PUBLISHED',
      locale,
      slug,
    });

    return entries.data[0] ?? null;
  }

  /**
   * List published entries for a content type.
   */
  async listPublished(contentType: string, locale = 'en', page = 1, limit = 10) {
    const type = await this.typeService.findBySlug(contentType);
    if (!type) return { data: [], total: 0 };

    return this.entryService.findAll({
      contentTypeId: type.id,
      status: 'PUBLISHED',
      locale,
      page,
      limit,
    });
  }

  /**
   * Get all content types (for navigation/sitemap generation).
   */
  async getContentTypes() {
    return this.typeService.findAll();
  }
}
