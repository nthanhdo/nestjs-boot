import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Processor, Process, OnFailed, OnCompleted } from 'nestjs-boot';
import { JobDocument } from './schemas/job.schema';
import { CleanupExpiredHandler } from './handlers/cleanup-expired.handler';
import { HealthCheckAllHandler } from './handlers/health-check-all.handler';
import { ReportGeneratorHandler } from './handlers/report-generator.handler';
import { Queue } from 'bullmq';
import { InjectQueue } from 'nestjs-boot';

interface CreateJobInput {
  name: string;
  cron: string;
  handler: string;
  payload: string;
  enabled: boolean;
}

/**
 * SchedulerService manages cron job definitions in MongoDB and
 * uses BullMQ repeatable jobs for actual scheduling.
 *
 * Demonstrates nestjs-boot Queue module with repeatable jobs.
 */
@Injectable()
@Processor('scheduler')
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  private readonly handlers: Record<
    string,
    { execute: (payload: Record<string, unknown>) => Promise<unknown> }
  >;

  constructor(
    @InjectModel('Job')
    private readonly jobModel: Model<JobDocument>,
    @InjectQueue('scheduler')
    private readonly schedulerQueue: Queue,
    private readonly cleanupHandler: CleanupExpiredHandler,
    private readonly healthCheckHandler: HealthCheckAllHandler,
    private readonly reportHandler: ReportGeneratorHandler,
  ) {
    this.handlers = {
      'cleanup-expired': this.cleanupHandler,
      'health-check-all': this.healthCheckHandler,
      'report-generator': this.reportHandler,
    };
  }

  /**
   * On startup, re-register all enabled jobs as BullMQ repeatables.
   */
  async onModuleInit() {
    const activeJobs = await this.jobModel.find({ enabled: true, status: 'active' }).exec();
    this.logger.log(`Restoring ${activeJobs.length} active jobs from DB`);

    for (const job of activeJobs) {
      await this.registerRepeatable(job);
    }
  }

  /**
   * Process scheduled job executions from the queue.
   */
  @Process('execute-job')
  async processJob(bullJob: { data: { jobId: string } }) {
    const { jobId } = bullJob.data;
    const job = await this.jobModel.findById(jobId).exec();

    if (!job || job.status !== 'active') {
      this.logger.warn(`Job ${jobId} not found or not active, skipping`);
      return;
    }

    const handler = this.handlers[job.handler];
    if (!handler) {
      this.logger.error(`No handler registered for "${job.handler}"`);
      await this.jobModel.findByIdAndUpdate(jobId, {
        $inc: { failCount: 1 },
        status: 'failed',
        lastRun: new Date(),
      }).exec();
      return;
    }

    try {
      const payload = JSON.parse(job.payload || '{}');
      await handler.execute(payload);

      await this.jobModel.findByIdAndUpdate(jobId, {
        $inc: { runCount: 1 },
        lastRun: new Date(),
      }).exec();

      this.logger.log(`Job "${job.name}" (${job.handler}) executed successfully`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Job "${job.name}" failed: ${errMsg}`);

      await this.jobModel.findByIdAndUpdate(jobId, {
        $inc: { failCount: 1 },
        lastRun: new Date(),
      }).exec();
    }
  }

  @OnFailed()
  onFailed(job: { id?: string; name: string }, error: Error) {
    this.logger.error(
      `Queue job ${job.name} (${job.id}) failed: ${error.message}`,
    );
  }

  @OnCompleted()
  onCompleted(job: { id?: string; name: string }) {
    this.logger.log(`Queue job ${job.name} (${job.id}) completed`);
  }

  // --- gRPC methods ---

  async createJob(data: CreateJobInput) {
    const job = await this.jobModel.create({
      name: data.name,
      cron: data.cron,
      handler: data.handler,
      payload: data.payload || '{}',
      enabled: data.enabled !== false,
      status: data.enabled !== false ? 'active' : 'paused',
    });

    if (job.status === 'active') {
      await this.registerRepeatable(job);
    }

    return this.toResponse(job);
  }

  async getJob(id: string) {
    const job = await this.jobModel.findById(id).exec();
    if (!job) {
      return { id: '', name: '', cron: '', handler: '', status: 'not_found', lastRun: '', nextRun: '', runCount: 0, failCount: 0 };
    }
    return this.toResponse(job);
  }

  async listJobs(status: string, page = 1, limit = 20) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const skip = (Math.max(page, 1) - 1) * limit;

    const [items, total] = await Promise.all([
      this.jobModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(limit, 100))
        .exec(),
      this.jobModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((j) => this.toResponse(j)),
      total,
    };
  }

  async pauseJob(id: string) {
    const job = await this.jobModel.findByIdAndUpdate(
      id,
      { status: 'paused', enabled: false },
      { new: true },
    ).exec();

    if (job) {
      await this.removeRepeatable(job);
    }

    return job ? this.toResponse(job) : this.notFound();
  }

  async resumeJob(id: string) {
    const job = await this.jobModel.findByIdAndUpdate(
      id,
      { status: 'active', enabled: true },
      { new: true },
    ).exec();

    if (job) {
      await this.registerRepeatable(job);
    }

    return job ? this.toResponse(job) : this.notFound();
  }

  async deleteJob(id: string) {
    const job = await this.jobModel.findById(id).exec();
    if (job) {
      await this.removeRepeatable(job);
      await this.jobModel.findByIdAndDelete(id).exec();
    }
    return { success: !!job };
  }

  async triggerJob(id: string) {
    const job = await this.jobModel.findById(id).exec();
    if (!job) return this.notFound();

    // Add an immediate (non-repeatable) job to the queue
    await this.schedulerQueue.add('execute-job', { jobId: id });

    this.logger.log(`Job "${job.name}" triggered manually`);
    return this.toResponse(job);
  }

  // --- Helpers ---

  private async registerRepeatable(job: JobDocument) {
    const repeatableKey = `job:${job._id!.toString()}`;
    await this.schedulerQueue.add(
      'execute-job',
      { jobId: job._id!.toString() },
      {
        repeat: { pattern: job.cron },
        jobId: repeatableKey,
      },
    );
    this.logger.log(`Registered repeatable "${job.name}" [${job.cron}]`);
  }

  private async removeRepeatable(job: JobDocument) {
    const repeatableKey = `job:${job._id!.toString()}`;
    try {
      await this.schedulerQueue.removeRepeatableByKey(repeatableKey);
    } catch {
      // Key may not exist if never registered
    }
    this.logger.log(`Removed repeatable "${job.name}"`);
  }

  private toResponse(job: JobDocument) {
    return {
      id: job._id!.toString(),
      name: job.name,
      cron: job.cron,
      handler: job.handler,
      status: job.status,
      lastRun: job.lastRun ? job.lastRun.toISOString() : '',
      nextRun: job.nextRun ? job.nextRun.toISOString() : '',
      runCount: job.runCount,
      failCount: job.failCount,
    };
  }

  private notFound() {
    return { id: '', name: '', cron: '', handler: '', status: 'not_found', lastRun: '', nextRun: '', runCount: 0, failCount: 0 };
  }
}
