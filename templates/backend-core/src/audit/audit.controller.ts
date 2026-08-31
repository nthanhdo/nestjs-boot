import { Controller, Get, Query } from '@nestjs/common';
import { AuditService, Permissions, RequireScope, AccessScope } from 'nestjs-boot';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * GET /audit-logs
   * Returns paginated audit log entries. Filterable by actor, action, resource, result, date range.
   */
  @Get('audit-logs')
  @Permissions('audit_log.read')
  @RequireScope(AccessScope.ORGANIZATION)
  async findAuditLogs(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('result') result?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query() pagination?: PaginationDto,
  ) {
    const limit = pagination?.limit ?? 20;
    const page = pagination?.page ?? 1;

    return this.audit.findAuditEntries({
      actorId,
      action,
      resource,
      result,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit,
      offset: (page - 1) * limit,
    });
  }

  /**
   * GET /security-events
   * Returns paginated security events. Filterable by type, severity, date range.
   * Requires SYSTEM scope — admin-only.
   */
  @Get('security-events')
  @Permissions('audit_log.read')
  @RequireScope(AccessScope.SYSTEM)
  async findSecurityEvents(
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query() pagination?: PaginationDto,
  ) {
    const limit = pagination?.limit ?? 20;
    const page = pagination?.page ?? 1;

    return this.audit.findSecurityEvents({
      type,
      severity,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit,
      offset: (page - 1) * limit,
    });
  }
}
