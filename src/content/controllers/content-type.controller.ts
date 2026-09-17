import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ContentTypeService } from '../services/content-type.service';
import { ContentWebhookService } from '../services/content-webhook.service';
import { ContentEvents } from '../events/content.events';
import type { ContentFieldDefinition } from '../interfaces';

@Controller('api/content/types')
export class ContentTypeController {
  constructor(
    private readonly typeService: ContentTypeService,
    private readonly webhookService: ContentWebhookService,
  ) {}

  @Post()
  async create(@Body() body: {
    name: string;
    slug: string;
    description?: string;
    fields?: ContentFieldDefinition[];
    components?: string[];
    tenantId?: string;
  }) {
    const type = await this.typeService.create(body);
    await this.webhookService.dispatch({
      type: ContentEvents.TYPE_CREATED,
      payload: { contentType: type },
      tenantId: body.tenantId,
      timestamp: new Date(),
    });
    return type;
  }

  @Get()
  async findAll(@Query('tenantId') tenantId?: string) {
    return this.typeService.findAll(tenantId);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.typeService.findById(id, tenantId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; slug?: string; description?: string; fields?: ContentFieldDefinition[]; components?: string[] },
    @Query('tenantId') tenantId?: string,
  ) {
    const type = await this.typeService.update(id, body, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.TYPE_UPDATED,
      payload: { contentType: type },
      tenantId,
      timestamp: new Date(),
    });
    return type;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.typeService.delete(id, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.TYPE_DELETED,
      payload: { contentTypeId: id },
      tenantId,
      timestamp: new Date(),
    });
  }

  // --- Field operations ---

  @Post(':id/fields')
  async addField(
    @Param('id') id: string,
    @Body() field: ContentFieldDefinition,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.typeService.addField(id, field, tenantId);
  }

  @Put(':id/fields/:fieldName')
  async updateField(
    @Param('id') id: string,
    @Param('fieldName') fieldName: string,
    @Body() updates: Partial<ContentFieldDefinition>,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.typeService.updateField(id, fieldName, updates, tenantId);
  }

  @Delete(':id/fields/:fieldName')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeField(
    @Param('id') id: string,
    @Param('fieldName') fieldName: string,
    @Query('tenantId') tenantId?: string,
  ) {
    await this.typeService.removeField(id, fieldName, tenantId);
  }
}
