import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ContentEntryService } from '../services/content-entry.service';
import { ContentPublishingService } from '../services/content-publishing.service';
import { ContentVersionService } from '../services/content-version.service';
import { ContentWebhookService } from '../services/content-webhook.service';
import { ContentEvents } from '../events/content.events';
import type { EntryStatus } from '../enums/entry-status.enum';

@Controller('api/content/entries')
export class ContentEntryController {
  constructor(
    private readonly entryService: ContentEntryService,
    private readonly publishingService: ContentPublishingService,
    private readonly versionService: ContentVersionService,
    private readonly webhookService: ContentWebhookService,
  ) {}

  @Post()
  async create(@Body() body: {
    contentTypeId: string;
    data: Record<string, unknown>;
    locale?: string;
    slug?: string;
    tenantId?: string;
    createdBy?: string;
  }) {
    const entry = await this.entryService.create(body);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_CREATED,
      payload: { entry },
      tenantId: body.tenantId,
      timestamp: new Date(),
    });
    return entry;
  }

  @Get()
  async findAll(
    @Query('contentTypeId') contentTypeId?: string,
    @Query('contentTypeSlug') contentTypeSlug?: string,
    @Query('locale') locale?: string,
    @Query('status') status?: EntryStatus,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.entryService.findAll({
      contentTypeId,
      contentTypeSlug,
      locale,
      status,
      search,
      sort,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    }, tenantId);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.entryService.findById(id, tenantId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { data?: Record<string, unknown>; slug?: string },
    @Query('tenantId') tenantId?: string,
  ) {
    const entry = await this.entryService.update(id, body, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_UPDATED,
      payload: { entry },
      tenantId,
      timestamp: new Date(),
    });
    return entry;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.entryService.delete(id, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_DELETED,
      payload: { entryId: id },
      tenantId,
      timestamp: new Date(),
    });
  }

  // --- Workflow actions ---

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    const entry = await this.publishingService.approve(id, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_STATUS_CHANGED,
      payload: { entry, newStatus: 'APPROVED' },
      tenantId,
      timestamp: new Date(),
    });
    return entry;
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Query('tenantId') tenantId?: string,
  ) {
    const entry = await this.publishingService.reject(id, tenantId, body.comment);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_STATUS_CHANGED,
      payload: { entry, newStatus: 'REJECTED' },
      tenantId,
      timestamp: new Date(),
    });
    return entry;
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    const entry = await this.publishingService.publish(id, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_PUBLISHED,
      payload: { entry },
      tenantId,
      timestamp: new Date(),
    });
    return entry;
  }

  @Post(':id/schedule')
  async schedule(
    @Param('id') id: string,
    @Body() body: { scheduledAt: string },
    @Query('tenantId') tenantId?: string,
  ) {
    const entry = await this.publishingService.schedule(id, new Date(body.scheduledAt), tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_STATUS_CHANGED,
      payload: { entry, newStatus: 'SCHEDULED', scheduledAt: body.scheduledAt },
      tenantId,
      timestamp: new Date(),
    });
    return entry;
  }

  @Post(':id/unpublish')
  async unpublish(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    const entry = await this.publishingService.unpublish(id, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_UNPUBLISHED,
      payload: { entry },
      tenantId,
      timestamp: new Date(),
    });
    return entry;
  }

  @Post(':id/archive')
  async archive(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    const entry = await this.publishingService.archive(id, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.ENTRY_STATUS_CHANGED,
      payload: { entry, newStatus: 'ARCHIVED' },
      tenantId,
      timestamp: new Date(),
    });
    return entry;
  }

  // --- Versioning ---

  @Get(':id/versions')
  async listVersions(@Param('id') id: string) {
    return this.versionService.findVersions(id);
  }

  @Get(':id/versions/:version')
  async getVersion(@Param('id') id: string, @Param('version') version: string) {
    return this.versionService.findVersion(id, parseInt(version, 10));
  }

  @Post(':id/versions/:version/restore')
  async restore(
    @Param('id') id: string,
    @Param('version') version: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const data = await this.versionService.rollback(id, parseInt(version, 10));
    return this.entryService.update(id, { data }, tenantId);
  }

  // --- Duplicate ---

  @Post(':id/duplicate')
  async duplicate(
    @Param('id') id: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.entryService.duplicate(id, tenantId);
  }
}
