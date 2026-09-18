import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ContentLocaleRepository } from '../repositories/content-locale.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

@Controller('api/content/locales')
export class ContentLocaleController {
  constructor(
    private readonly localeRepo: ContentLocaleRepository,
    private readonly prisma: PrismaService,
  ) {}

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

  @Patch('default')
  async setDefault(
    @Body() body: { code: string },
    @Query('tenantId') tenantId?: string,
  ) {
    // Unset all defaults for this tenant
    const allLocales = await this.localeRepo.findAll(tenantId);
    for (const locale of allLocales) {
      if (locale.isDefault) {
        await this.localeRepo.update(locale.id, { isDefault: false });
      }
    }
    // Set the new default
    const target = await this.localeRepo.findByCode(body.code, tenantId);
    if (target) {
      await this.localeRepo.update(target.id, { isDefault: true });
    }
    return this.localeRepo.findAll(tenantId);
  }

  @Get(':code/translation-status')
  async translationStatus(
    @Param('code') code: string,
    @Query('tenantId') tenantId?: string,
  ) {
    // Count entries per content type for this locale
    const types = await this.prisma.client.contentType.findMany({
      where: tenantId ? { tenantId } : {},
    });

    const defaultLocale = await this.localeRepo.findDefault(tenantId);
    const defaultCode = defaultLocale?.code ?? 'en';

    const result = await Promise.all(
      types.map(async (ct) => {
        const total = await this.prisma.client.contentEntry.count({
          where: { contentTypeId: ct.id, locale: defaultCode },
        });
        const translated = await this.prisma.client.contentEntry.count({
          where: { contentTypeId: ct.id, locale: code },
        });
        return {
          contentType: ct.name,
          contentTypeId: ct.id,
          total,
          translated,
          percentage: total > 0 ? Math.round((translated / total) * 100) : 0,
        };
      }),
    );

    return result;
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('code') code: string, @Query('tenantId') tenantId?: string) {
    const locale = await this.localeRepo.findByCode(code, tenantId);
    if (locale) await this.localeRepo.delete(locale.id);
  }
}
