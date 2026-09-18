import { Controller, Get, Post, Body, Query, Header } from '@nestjs/common';
import { ContentBulkService } from '../services/content-bulk.service';

@Controller('api/content/bulk')
export class ContentBulkController {
  constructor(private readonly bulkService: ContentBulkService) {}

  @Get('export')
  async exportAll(@Query('tenantId') tenantId?: string) {
    return this.bulkService.exportAll(tenantId);
  }

  @Get('export/entries')
  async exportEntries(
    @Query('contentTypeId') contentTypeId?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.bulkService.exportEntries(contentTypeId, tenantId);
  }

  @Get('export/entries/csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="entries.csv"')
  async exportEntriesCsv(
    @Query('contentTypeId') contentTypeId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.bulkService.exportEntriesCsv(contentTypeId, tenantId);
  }

  @Post('import')
  async importAll(
    @Body() data: any,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.bulkService.importAll(data, tenantId);
  }

  @Post('import/entries/csv')
  async importEntriesCsv(
    @Body() body: { csv: string; contentTypeId: string },
    @Query('tenantId') tenantId?: string,
  ) {
    return this.bulkService.importEntriesCsv(body.csv, body.contentTypeId, tenantId);
  }
}
