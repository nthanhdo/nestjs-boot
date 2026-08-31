import { Module } from '@nestjs/common';
import { AuditModule } from 'nestjs-boot';
import { AuditController } from './audit.controller';

/**
 * AppAuditModule — exposes audit-log and security-event HTTP endpoints.
 *
 * Named "AppAuditModule" to avoid a naming collision with nestjs-boot's
 * own AuditModule, which this module imports for its AuditService.
 */
@Module({
  imports: [AuditModule],
  controllers: [AuditController],
})
export class AppAuditModule {}
