import { Injectable, Inject, Optional, BadRequestException, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ContentEntryRepository } from '../repositories/content-entry.repository';
import { EntryStatus, ENTRY_STATUS_TRANSITIONS } from '../enums/entry-status.enum';
import { CONTENT_MODULE_OPTIONS, RAG_EMBEDDING_SERVICE, CDN_PURGE_SERVICE } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';
import type { IContentEntry } from '../interfaces';
import type { RagEmbeddingService } from './rag/rag-embedding.service';
import type { CdnPurgeService } from './cdn/cdn-purge.service';

@Injectable()
export class ContentPublishingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentPublishingService.name);
  private schedulerInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly entryRepo: ContentEntryRepository,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
    @Optional() @Inject(RAG_EMBEDDING_SERVICE) private readonly ragEmbeddingService?: RagEmbeddingService,
    @Optional() @Inject(CDN_PURGE_SERVICE) private readonly cdnPurgeService?: CdnPurgeService,
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

    const updated = await this.entryRepo.update(entryId, updateData);

    // Trigger RAG embedding on publish (fire-and-forget)
    if (targetStatus === EntryStatus.PUBLISHED && this.ragEmbeddingService) {
      this.ragEmbeddingService.embedEntry(entryId, tenantId).catch((err) => {
        this.logger.error(`RAG embedding failed for entry ${entryId}: ${err}`);
      });
    }

    // Trigger CDN cache purge on publish/unpublish (fire-and-forget)
    if ((targetStatus === EntryStatus.PUBLISHED || targetStatus === EntryStatus.UNPUBLISHED) && this.cdnPurgeService) {
      this.cdnPurgeService.purgeEntry(entry.slug ?? undefined, entry.locale).catch((err) => {
        this.logger.error(`CDN purge failed for entry ${entryId}: ${err}`);
      });
    }

    return updated;
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

  /**
   * Schedule automatic unpublish at a future date.
   * Entry must be PUBLISHED. At the scheduled time, it will transition to UNPUBLISHED.
   */
  async scheduleUnpublish(entryId: string, scheduledUnpublishAt: Date, tenantId?: string): Promise<IContentEntry> {
    const entry = await this.entryRepo.findById(entryId, tenantId);
    if (!entry) throw new BadRequestException(`Entry "${entryId}" not found`);
    if (entry.status !== EntryStatus.PUBLISHED) {
      throw new BadRequestException('Only PUBLISHED entries can be scheduled for unpublish');
    }
    if (scheduledUnpublishAt <= new Date()) {
      throw new BadRequestException('scheduledUnpublishAt must be in the future');
    }
    return this.entryRepo.update(entryId, { scheduledUnpublishAt });
  }

  async archive(entryId: string, tenantId?: string): Promise<IContentEntry> {
    return this.transition(entryId, EntryStatus.ARCHIVED, tenantId);
  }

  /** Periodic check for scheduled publish and unpublish */
  private async processScheduledEntries(): Promise<void> {
    const now = new Date();

    // Scheduled publish
    try {
      const toPublish = await this.entryRepo.findScheduledEntries(now);
      for (const entry of toPublish) {
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

    // Scheduled unpublish
    try {
      const toUnpublish = await this.entryRepo.findScheduledUnpublishEntries(now);
      for (const entry of toUnpublish) {
        try {
          await this.entryRepo.update(entry.id, {
            status: EntryStatus.UNPUBLISHED,
            publishedAt: undefined,
            scheduledUnpublishAt: undefined,
          });
          this.logger.log(`Auto-unpublished entry "${entry.id}" (scheduled)`);

          if (this.cdnPurgeService) {
            this.cdnPurgeService.purgeEntry(entry.slug ?? undefined).catch(() => {});
          }
        } catch (err) {
          this.logger.error(`Failed to auto-unpublish entry "${entry.id}": ${err}`);
        }
      }
    } catch (err) {
      this.logger.error(`Scheduled unpublish check failed: ${err}`);
    }
  }
}
