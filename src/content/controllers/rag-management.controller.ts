import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { RagManagementService } from '../services/rag/rag-management.service';

@Controller('api/content/rag')
export class RagManagementController {
  constructor(private readonly ragManagement: RagManagementService) {}

  @Post('re-embed')
  async reEmbed(
    @Body() body: { contentTypeId?: string },
    @Query('tenantId') tenantId?: string,
  ) {
    return this.ragManagement.reEmbed(body.contentTypeId, tenantId);
  }

  @Get('status')
  async getStatus(@Query('tenantId') tenantId?: string) {
    return this.ragManagement.getStatus(tenantId);
  }
}
