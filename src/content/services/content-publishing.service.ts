import { Injectable, Inject, BadRequestException, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ContentEntryRepository } from '../repositories/content-entry.repository';
import { EntryStatus, ENTRY_STATUS_TRANSITIONS } from '../enums/entry-status.enum';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';
import type { IContentEntry } from '../interfaces';

@Injectable()
export class ContentPublishingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentPublishingService.name);
  private schedulerInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly entryRepo: ContentEntryRepository,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
  ) {}

  onModuleInit(): void {
    const interval = this.options.scheduleCheckInterval ?? 60_000;
    this.schedulerInterval = setInterval(() => this.processScheduledEntries(), interval);
    this.logger.log(`Scheduled publish checker started (interval: ${interval}ms)`);
  }

  onModuleDestroy(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }
  }

  async transition(entryId: string, targetStatus: EntryStatus, tenantId?: string, options?: {
    scheduledAt?: Date;
    comment?: string;
    changedBy?: string;
  }): Promise<IContentEntry> {
    const entry = await this.entryRepo.findById(entryId, tenantId);
    if (!entry) throw new BadRequestException(`Entry "${entryId}" not found`);

    const currentStatus = entry.status as EntryStatus;
    const allowed = ENTRY_STATUS_TRANSITIONS[currentStatus];

    if (!allowed?.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from "${currentStatus}" to "${targetStatus}". Allowed: ${allowed?.join(', ') ?? 'none'}`,
      );
    }

    const updateData: Partial<IContentEntry> = { status: targetStatus };

    if (targetStatus === EntryStatus.PUBLISHED) {
      updateData.publishedAt = new Date();
      updateData.scheduledAt = undefined;
    }

    if (targetStatus === EntryStatus.SCHEDULED) {
      if (!options?.scheduledAt) {
        throw new BadRequestException('scheduledAt is required for SCHEDULED status');
      }
      if (options.scheduledAt <= new Date()) {
        throw new BadRequestException('scheduledAt must be in the future');
      }
      updateData.scheduledAt = options.scheduledAt;
    }

    if (targetStatus === EntryStatus.UNPUBLISHED) {
      updateData.publishedAt = undefined;
    }

    return this.entryRepo.update(entryId, updateData);
  }

  /** Convenience methods */
  async approve(entryId: string, tenantId?: string, changedBy?: string): Promise<IContentEntry> {
    return this.transition(entryId, EntryStatus.APPROVED, tenantId, { changedBy });
  }

  async reject(entryId: string, tenantId?: string, comment?: string): Promise<IContentEntry> {
    return this.transition(entryId, EntryStatus.REJECTED, tenantId, { comment });
  }

  async publish(entryId: string, tenantId?: string): Promise<IContentEntry> {
    return this.transition(entryId, EntryStatus.PUBLISHED, tenantId);
  }

  async schedule(entryId: string, scheduledAt: Date, tenantId?: string): Promise<IContentEntry> {
    return this.transition(entryId, EntryStatus.SCHEDULED, tenantId, { scheduledAt });
  }

  async unpublish(entryId: string, tenantId?: string): Promise<IContentEntry> {
    return this.transition(entryId, EntryStatus.UNPUBLISHED, tenantId);
  }

  async archive(entryId: string, tenantId?: string): Promise<IContentEntry> {
    return this.transition(entryId, EntryStatus.ARCHIVED, tenantId);
  }

  /** Periodic check for scheduled entries that need to be published */
  private async processScheduledEntries(): Promise<void> {
    try {
      const entries = await this.entryRepo.findScheduledEntries(new Date());
      for (const entry of entries) {
        try {
          await this.entryRepo.update(entry.id, {
            status: EntryStatus.PUBLISHED,
            publishedAt: new Date(),
            scheduledAt: undefined,
          });
          this.logger.log(`Auto-published entry "${entry.id}" (scheduled)`);
        } catch (err) {
          this.logger.error(`Failed to auto-publish entry "${entry.id}": ${err}`);
        }
      }
    } catch (err) {
      this.logger.error(`Scheduled publish check failed: ${err}`);
    }
  }
}
