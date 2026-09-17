import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ContentAssetService } from '../services/content-asset.service';
import { ContentWebhookService } from '../services/content-webhook.service';
import { ContentEvents } from '../events/content.events';

@Controller('api/content/assets')
export class ContentAssetController {
  constructor(
    private readonly assetService: ContentAssetService,
    private readonly webhookService: ContentWebhookService,
  ) {}

  @Post()
  async upload(@Body() body: {
    filename: string;
    mimeType: string;
    size: number;
    /** Base64 encoded file content */
    content: string;
    folder?: string;
    tags?: string[];
    altText?: Record<string, string>;
    tenantId?: string;
  }) {
    const buffer = Buffer.from(body.content, 'base64');
    const asset = await this.assetService.upload({
      filename: body.filename,
      mimeType: body.mimeType,
      size: body.size,
      buffer,
      folder: body.folder,
      tags: body.tags,
      altText: body.altText,
      tenantId: body.tenantId,
    });
    await this.webhookService.dispatch({
      type: ContentEvents.ASSET_UPLOADED,
      payload: { asset },
      tenantId: body.tenantId,
      timestamp: new Date(),
    });
    return asset;
  }

  @Get()
  async findAll(
    @Query('tenantId') tenantId?: string,
    @Query('folder') folder?: string,
    @Query('mimeType') mimeType?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.assetService.findAll(
      { tenantId, folder, mimeType },
      page ? parseInt(page, 10) : undefined,
      pageSize ? parseInt(pageSize, 10) : undefined,
    );
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.assetService.findById(id, tenantId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { filename?: string; folder?: string; tags?: string[]; altText?: Record<string, string> },
    @Query('tenantId') tenantId?: string,
  ) {
    return this.assetService.update(id, body, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    await this.assetService.delete(id, tenantId);
    await this.webhookService.dispatch({
      type: ContentEvents.ASSET_DELETED,
      payload: { assetId: id },
      tenantId,
      timestamp: new Date(),
    });
  }
}
