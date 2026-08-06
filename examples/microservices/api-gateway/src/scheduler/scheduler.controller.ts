import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { SchedulerGateway } from './scheduler.gateway';

@Controller('scheduler/jobs')
export class SchedulerController {
  constructor(private readonly schedulerGateway: SchedulerGateway) {}

  @Post()
  createJob(
    @Body()
    body: {
      name: string;
      cron: string;
      handler: string;
      payload?: string;
      enabled?: boolean;
    },
  ) {
    return this.schedulerGateway.createJob(
      body.name,
      body.cron,
      body.handler,
      body.payload || '{}',
      body.enabled !== false,
    );
  }

  @Get()
  listJobs(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.schedulerGateway.listJobs(
      status || '',
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  getJob(@Param('id') id: string) {
    return this.schedulerGateway.getJob(id);
  }

  @Patch(':id/pause')
  pauseJob(@Param('id') id: string) {
    return this.schedulerGateway.pauseJob(id);
  }

  @Patch(':id/resume')
  resumeJob(@Param('id') id: string) {
    return this.schedulerGateway.resumeJob(id);
  }

  @Post(':id/trigger')
  triggerJob(@Param('id') id: string) {
    return this.schedulerGateway.triggerJob(id);
  }

  @Delete(':id')
  deleteJob(@Param('id') id: string) {
    return this.schedulerGateway.deleteJob(id);
  }
}
