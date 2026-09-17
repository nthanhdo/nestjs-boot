import {
  Controller, Get, Param, Query, Req, UseGuards, Inject,
} from '@nestjs/common';
import { ContentEntryService } from '../services/content-entry.service';
import { ContentTypeService } from '../services/content-type.service';
import { ContentAssetService } from '../services/content-asset.service';
import { ContentSearchService } from '../services/content-search.service';
import { ContentLocalizationService } from '../services/content-localization.service';
import { ContentApiKeyGuard } from '../guards/content-api-key.guard';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import { EntryStatus } from '../enums/entry-status.enum';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';

@Controller('api/delivery')
@UseGuards(ContentApiKeyGuard)
export class DeliveryController {
  constructor(
    private readonly entryService: ContentEntryService,
    private readonly typeService: ContentTypeService,
    private readonly assetService: ContentAssetService,
    private readonly searchService: ContentSearchService,
    private readonly localizationService: ContentLocalizationService,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
  ) {}

  @Get('types')
  async listTypes(@Req() req: any) {
    return this.typeService.findAll(req.contentTenantId);
  }

  @Get('entries')
  async listEntries(
    @Req() req: any,
    @Query('type') contentTypeSlug?: string,
    @Query('locale') locale?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('fields') fields?: string,
  ) {
    const tenantId = req.contentTenantId;
    const requestedLocale = locale ?? this.options.defaultLocale ?? 'en';

    // If search query provided, use search service
    if (search) {
      return this.searchService.search({
        query: search,
        locale: requestedLocale,
        status: EntryStatus.PUBLISHED,
        tenantId,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      });
    }

    return this.entryService.findAll({
      contentTypeSlug,
      locale: requestedLocale,
      status: EntryStatus.PUBLISHED,
      sort,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      fields: fields?.split(','),
    }, tenantId);
  }

  @Get('entries/by-slug/:slug')
  async getBySlug(
    @Param('slug') slug: string,
    @Req() req: any,
    @Query('locale') locale?: string,
    @Query('preview') preview?: string,
  ) {
    const tenantId = req.contentTenantId;
    const requestedLocale = locale ?? this.options.defaultLocale ?? 'en';

    // Preview mode returns draft entries (requires specific API key permission)
    if (preview === 'true') {
      return this.entryService.findBySlug(slug, requestedLocale, tenantId);
    }

    const entry = await this.entryService.findBySlug(slug, requestedLocale, tenantId);
    if (entry.status !== EntryStatus.PUBLISHED) {
      // Try localization fallback
      const fallback = await this.localizationService.resolveWithFallback(entry.id, requestedLocale, tenantId);
      if (fallback && fallback.status === EntryStatus.PUBLISHED) return fallback;
      return null;
    }
    return entry;
  }

  @Get('entries/:id')
  async getById(
    @Param('id') id: string,
    @Req() req: any,
    @Query('locale') _locale?: string,
  ) {
    const tenantId = req.contentTenantId;
    return this.entryService.findById(id, tenantId);
  }

  @Get('assets/:id')
  async getAsset(@Param('id') id: string, @Req() req: any) {
    const tenantId = req.contentTenantId;
    const asset = await this.assetService.findById(id, tenantId);
    const signedUrl = await this.assetService.getSignedUrl(id, tenantId);
    return { ...asset, url: signedUrl };
  }
}
