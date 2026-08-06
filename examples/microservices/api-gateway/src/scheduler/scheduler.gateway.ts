import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface JobResponse {
  id: string;
  name: string;
  cron: string;
  handler: string;
  status: string;
  lastRun: string;
  nextRun: string;
  runCount: number;
  failCount: number;
}

interface JobListResponse {
  items: JobResponse[];
  total: number;
}

interface DeleteResponse {
  success: boolean;
}

interface SchedulerServiceGrpc {
  createJob(data: {
    name: string;
    cron: string;
    handler: string;
    payload: string;
    enabled: boolean;
  }): Observable<JobResponse>;
  getJob(data: { id: string }): Observable<JobResponse>;
  listJobs(data: {
    status: string;
    page: number;
    limit: number;
  }): Observable<JobListResponse>;
  pauseJob(data: { id: string }): Observable<JobResponse>;
  resumeJob(data: { id: string }): Observable<JobResponse>;
  deleteJob(data: { id: string }): Observable<DeleteResponse>;
  triggerJob(data: { id: string }): Observable<JobResponse>;
}

@Injectable()
export class SchedulerGateway implements OnModuleInit {
  private schedulerService!: SchedulerServiceGrpc;

  constructor(
    @Inject('SCHEDULER_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.schedulerService =
      this.client.getService<SchedulerServiceGrpc>('SchedulerService');
  }

  createJob(
    name: string,
    cron: string,
    handler: string,
    payload: string,
    enabled: boolean,
  ): Observable<JobResponse> {
    return this.schedulerService.createJob({
      name,
      cron,
      handler,
      payload,
      enabled,
    });
  }

  getJob(id: string): Observable<JobResponse> {
    return this.schedulerService.getJob({ id });
  }

  listJobs(
    status: string,
    page: number,
    limit: number,
  ): Observable<JobListResponse> {
    return this.schedulerService.listJobs({ status, page, limit });
  }

  pauseJob(id: string): Observable<JobResponse> {
    return this.schedulerService.pauseJob({ id });
  }

  resumeJob(id: string): Observable<JobResponse> {
    return this.schedulerService.resumeJob({ id });
  }

  deleteJob(id: string): Observable<DeleteResponse> {
    return this.schedulerService.deleteJob({ id });
  }

  triggerJob(id: string): Observable<JobResponse> {
    return this.schedulerService.triggerJob({ id });
  }
}
