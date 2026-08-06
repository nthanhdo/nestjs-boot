import { Module } from '@nestjs/common';
import { DatabaseModule, QueueModule } from 'nestjs-boot';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { CleanupExpiredHandler } from './handlers/cleanup-expired.handler';
import { HealthCheckAllHandler } from './handlers/health-check-all.handler';
import { ReportGeneratorHandler } from './handlers/report-generator.handler';
import { Job, JobSchema } from './schemas/job.schema';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: Job.name, schema: JobSchema },
    ]),
    QueueModule.registerQueue({ name: 'scheduler' }),
  ],
  controllers: [SchedulerController],
  providers: [
    SchedulerService,
    CleanupExpiredHandler,
    HealthCheckAllHandler,
    ReportGeneratorHandler,
  ],
})
export class AppModule {}
