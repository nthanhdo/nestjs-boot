import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ContentApiKeyRepository } from '../repositories/content-api-key.repository';
import { randomBytes } from 'crypto';

@Controller('api/content/api-keys')
export class ContentApiKeyController {
  constructor(private readonly apiKeyRepo: ContentApiKeyRepository) {}

  @Post()
  async create(@Body() body: {
    name: string;
    environment?: string;
    permissions?: Record<string, unknown>;
    tenantId?: string;
  }) {
    // Generate a raw key to return once, store only the hash
    const rawKey = `ck_${randomBytes(24).toString('hex')}`;
    const keyHash = ContentApiKeyRepository.hashKey(rawKey);

    const record = await this.apiKeyRepo.create({
      keyHash,
      name: body.name,
      environment: body.environment,
      permissions: body.permissions,
      tenantId: body.tenantId,
    });

    return {
      ...record,
      key: rawKey, // Only returned on creation
    };
  }

  @Get()
  async findAll(@Query('tenantId') tenantId?: string) {
    return this.apiKeyRepo.findAll(tenantId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; environment?: string; permissions?: Record<string, unknown> },
  ) {
    return this.apiKeyRepo.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.apiKeyRepo.delete(id);
  }
}
