import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ContentWebhookRepository } from '../repositories/content-webhook.repository';
import { randomBytes } from 'crypto';

@Controller('api/content/webhooks')
export class ContentWebhookController {
  constructor(private readonly webhookRepo: ContentWebhookRepository) {}

  @Post()
  async create(@Body() body: {
    url: string;
    events: string[];
    tenantId?: string;
  }) {
    const secret = randomBytes(32).toString('hex');
    return this.webhookRepo.create({
      url: body.url,
      events: body.events,
      secret,
      tenantId: body.tenantId,
    });
  }

  @Get()
  async findAll(@Query('tenantId') tenantId?: string) {
    return this.webhookRepo.findAll(tenantId);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Query('tenantId') tenantId?: string) {
    return this.webhookRepo.findById(id, tenantId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { url?: string; events?: string[]; active?: boolean },
  ) {
    return this.webhookRepo.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.webhookRepo.delete(id);
  }

  @Get(':id/logs')
  async logs(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.webhookRepo.findLogs(
      id,
      page ? parseInt(page, 10) : undefined,
      pageSize ? parseInt(pageSize, 10) : undefined,
    );
  }
}
