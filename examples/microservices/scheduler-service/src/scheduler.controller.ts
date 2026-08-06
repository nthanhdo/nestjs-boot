import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { SchedulerService } from './scheduler.service';

interface CreateJobRequest {
  name: string;
  cron: string;
  handler: string;
  payload: string;
  enabled: boolean;
}

interface JobById {
  id: string;
}

interface ListJobsRequest {
  status: string;
  page: number;
  limit: number;
}

@Controller()
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @GrpcMethod('SchedulerService', 'CreateJob')
  async createJob(data: CreateJobRequest) {
    return this.schedulerService.createJob(data);
  }

  @GrpcMethod('SchedulerService', 'GetJob')
  async getJob(data: JobById) {
    return this.schedulerService.getJob(data.id);
  }

  @GrpcMethod('SchedulerService', 'ListJobs')
  async listJobs(data: ListJobsRequest) {
    return this.schedulerService.listJobs(data.status, data.page, data.limit);
  }

  @GrpcMethod('SchedulerService', 'PauseJob')
  async pauseJob(data: JobById) {
    return this.schedulerService.pauseJob(data.id);
  }

  @GrpcMethod('SchedulerService', 'ResumeJob')
  async resumeJob(data: JobById) {
    return this.schedulerService.resumeJob(data.id);
  }

  @GrpcMethod('SchedulerService', 'DeleteJob')
  async deleteJob(data: JobById) {
    return this.schedulerService.deleteJob(data.id);
  }

  @GrpcMethod('SchedulerService', 'TriggerJob')
  async triggerJob(data: JobById) {
    return this.schedulerService.triggerJob(data.id);
  }
}
