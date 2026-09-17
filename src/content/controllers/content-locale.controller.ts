import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ContentLocaleRepository } from '../repositories/content-locale.repository';

@Controller('api/content/locales')
export class ContentLocaleController {
  constructor(private readonly localeRepo: ContentLocaleRepository) {}

  @Post()
  async create(@Body() body: {
    code: string;
    name: string;
    isDefault?: boolean;
    fallbackLocale?: string;
    tenantId?: string;
  }) {
    return this.localeRepo.create(body);
  }

  @Get()
  async findAll(@Query('tenantId') tenantId?: string) {
    return this.localeRepo.findAll(tenantId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; isDefault?: boolean; fallbackLocale?: string },
  ) {
    return this.localeRepo.update(id, body);
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('code') code: string, @Query('tenantId') tenantId?: string) {
    const locale = await this.localeRepo.findByCode(code, tenantId);
    if (locale) await this.localeRepo.delete(locale.id);
  }
}
