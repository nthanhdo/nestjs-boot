import {
  Controller, Get, Param, Query, Req, UseGuards, Inject, Optional, UseInterceptors,
} from '@nestjs/common';
import { ContentEntryService } from '../services/content-entry.service';
import { ContentTypeService } from '../services/content-type.service';
import { ContentAssetService } from '../services/content-asset.service';
import { ContentSearchService } from '../services/content-search.service';
import { ContentLocalizationService } from '../services/content-localization.service';
import { ContentApiKeyGuard } from '../guards/content-api-key.guard';
import { CONTENT_MODULE_OPTIONS, RAG_SEARCH_SERVICE } from '../constants';
import { EntryStatus } from '../enums/entry-status.enum';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';
import { ContentReferenceService } from '../services/content-reference.service';
import type { RagSearchService } from '../services/rag/rag-search.service';
import { CdnCacheInterceptor } from '../interceptors/cdn-cache.interceptor';
import { DeliveryRateLimitGuard } from '../guards/delivery-rate-limit.guard';

@Controller('api/delivery')
@UseGuards(ContentApiKeyGuard, DeliveryRateLimitGuard)
@UseInterceptors(CdnCacheInterceptor)
export class DeliveryController {
  constructor(
    private readonly entryService: ContentEntryService,
    private readonly typeService: ContentTypeService,
    private readonly assetService: ContentAssetService,
    private readonly searchService: ContentSearchService,
    private readonly localizationService: ContentLocalizationService,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
    private readonly referenceService: ContentReferenceService,
    @Optional() @Inject(RAG_SEARCH_SERVICE) private readonly ragSearchService?: RagSearchService,
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
    @Query('mode') mode?: 'keyword' | 'semantic' | 'hybrid',
  ) {
    const tenantId = req.contentTenantId;
    const requestedLocale = locale ?? this.options.defaultLocale ?? 'en';
    const parsedPage = page ? parseInt(page, 10) : undefined;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : undefined;

    // If search query provided, dispatch to appropriate search engine
    if (search) {
      const searchMode = mode ?? (this.ragSearchService ? 'hybrid' : 'keyword');

      if (searchMode === 'semantic' && this.ragSearchService) {
        return this.ragSearchService.semanticSearch({
          query: search, locale: requestedLocale, tenantId,
          page: parsedPage, pageSize: parsedPageSize,
        });
      }

      if (searchMode === 'hybrid' && this.ragSearchService) {
        return this.ragSearchService.hybridSearch({
          query: search, locale: requestedLocale, tenantId,
          page: parsedPage, pageSize: parsedPageSize,
        });
      }

      // Default: keyword search
      return this.searchService.search({
        query: search,
        locale: requestedLocale,
        status: EntryStatus.PUBLISHED,
        tenantId,
        page: parsedPage,
        pageSize: parsedPageSize,
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
    @Query('populate') populate?: string,
  ) {
    const tenantId = req.contentTenantId;
    const requestedLocale = locale ?? this.options.defaultLocale ?? 'en';

    let entry;
    if (preview === 'true') {
      entry = await this.entryService.findBySlug(slug, requestedLocale, tenantId);
    } else {
      entry = await this.entryService.findBySlug(slug, requestedLocale, tenantId);
      if (entry.status !== EntryStatus.PUBLISHED) {
        const fallback = await this.localizationService.resolveWithFallback(entry.id, requestedLocale, tenantId);
        if (fallback && fallback.status === EntryStatus.PUBLISHED) entry = fallback;
        else return null;
      }
    }

    // Resolve references if populate requested
    if (populate && entry) {
      const populateFields = populate === '*' ? ['*'] : populate.split(',');
      const type = await this.typeService.findById(entry.contentTypeId, tenantId);
      entry = await this.referenceService.resolveReferences(entry, type, populateFields);
    }

    return entry;
  }

  @Get('entries/:id')
  async getById(
    @Param('id') id: string,
    @Req() req: any,
    @Query('locale') _locale?: string,
    @Query('populate') populate?: string,
  ) {
    const tenantId = req.contentTenantId;
    let entry = await this.entryService.findById(id, tenantId);

    if (populate) {
      const populateFields = populate === '*' ? ['*'] : populate.split(',');
      const type = await this.typeService.findById(entry.contentTypeId, tenantId);
      entry = await this.referenceService.resolveReferences(entry, type, populateFields);
    }

    return entry;
  }

  @Get('assets/:id')
  async getAsset(@Param('id') id: string, @Req() req: any) {
    const tenantId = req.contentTenantId;
    const asset = await this.assetService.findById(id, tenantId);
    const signedUrl = await this.assetService.getSignedUrl(id, tenantId);
    return { ...asset, url: signedUrl };
  }
}
