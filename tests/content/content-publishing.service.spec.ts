import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentPublishingService } from '../../src/content/services/content-publishing.service';
import { EntryStatus } from '../../src/content/enums/entry-status.enum';

describe('ContentPublishingService', () => {
  let service: ContentPublishingService;
  let mockEntryRepo: any;
  const options = { scheduleCheckInterval: 999999 }; // prevent auto-run in tests

  beforeEach(() => {
    mockEntryRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      findScheduledEntries: vi.fn().mockResolvedValue([]),
    };
    service = new ContentPublishingService(mockEntryRepo, options as any);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  function mockEntry(status: EntryStatus) {
    return { id: '1', status, version: 1, data: {} };
  }

  describe('transition', () => {
    it('should transition DRAFT → APPROVED', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.DRAFT));
      mockEntryRepo.update.mockResolvedValue({ ...mockEntry(EntryStatus.APPROVED) });

      const result = await service.approve('1');

      expect(mockEntryRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({ status: EntryStatus.APPROVED }));
    });

    it('should transition APPROVED → PUBLISHED with publishedAt', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.APPROVED));
      mockEntryRepo.update.mockResolvedValue({ ...mockEntry(EntryStatus.PUBLISHED), publishedAt: new Date() });

      await service.publish('1');

      expect(mockEntryRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({
        status: EntryStatus.PUBLISHED,
        publishedAt: expect.any(Date),
      }));
    });

    it('should reject invalid transition DRAFT → PUBLISHED', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.DRAFT));

      await expect(service.publish('1')).rejects.toThrow('Cannot transition');
    });

    it('should reject invalid transition PUBLISHED → APPROVED', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.PUBLISHED));

      await expect(service.approve('1')).rejects.toThrow('Cannot transition');
    });

    it('should transition APPROVED → SCHEDULED with scheduledAt', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.APPROVED));
      mockEntryRepo.update.mockResolvedValue({ ...mockEntry(EntryStatus.SCHEDULED) });

      const future = new Date(Date.now() + 86400000); // tomorrow
      await service.schedule('1', future);

      expect(mockEntryRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({
        status: EntryStatus.SCHEDULED,
        scheduledAt: future,
      }));
    });

    it('should reject SCHEDULED without scheduledAt', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.APPROVED));

      await expect(
        service.transition('1', EntryStatus.SCHEDULED),
      ).rejects.toThrow('scheduledAt is required');
    });

    it('should reject SCHEDULED with past date', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.APPROVED));

      const past = new Date(Date.now() - 1000);
      await expect(
        service.schedule('1', past),
      ).rejects.toThrow('must be in the future');
    });

    it('should transition PUBLISHED → UNPUBLISHED clearing publishedAt', async () => {
      mockEntryRepo.findById.mockResolvedValue({ ...mockEntry(EntryStatus.PUBLISHED), publishedAt: new Date() });
      mockEntryRepo.update.mockResolvedValue({ ...mockEntry(EntryStatus.UNPUBLISHED) });

      await service.unpublish('1');

      expect(mockEntryRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({
        status: EntryStatus.UNPUBLISHED,
        publishedAt: undefined,
      }));
    });

    it('should transition REJECTED → DRAFT', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.REJECTED));
      mockEntryRepo.update.mockResolvedValue(mockEntry(EntryStatus.DRAFT));

      const result = await service.transition('1', EntryStatus.DRAFT);
      expect(mockEntryRepo.update).toHaveBeenCalled();
    });

    it('should transition ARCHIVED → DRAFT', async () => {
      mockEntryRepo.findById.mockResolvedValue(mockEntry(EntryStatus.ARCHIVED));
      mockEntryRepo.update.mockResolvedValue(mockEntry(EntryStatus.DRAFT));

      await service.transition('1', EntryStatus.DRAFT);
      expect(mockEntryRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({ status: EntryStatus.DRAFT }));
    });
  });
});
