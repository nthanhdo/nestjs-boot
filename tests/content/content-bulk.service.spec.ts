import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentBulkService } from '../../src/content/services/content-bulk.service';

describe('ContentBulkService', () => {
  let service: ContentBulkService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        contentType: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
        contentComponent: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
        contentEntry: { findMany: vi.fn(), create: vi.fn() },
        contentLocale: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
      },
    };
    service = new ContentBulkService(mockPrisma);
  });

  describe('exportAll', () => {
    it('should export all content data', async () => {
      mockPrisma.client.contentType.findMany.mockResolvedValue([{ id: '1', name: 'Blog', slug: 'blog' }]);
      mockPrisma.client.contentComponent.findMany.mockResolvedValue([]);
      mockPrisma.client.contentEntry.findMany.mockResolvedValue([{ id: 'e1', data: { title: 'Test' } }]);
      mockPrisma.client.contentLocale.findMany.mockResolvedValue([{ code: 'en', name: 'English' }]);

      const result = await service.exportAll();

      expect(result.contentTypes).toHaveLength(1);
      expect(result.entries).toHaveLength(1);
      expect(result.locales).toHaveLength(1);
      expect(result.version).toBe('1.0');
      expect(result.exportedAt).toBeDefined();
    });
  });

  describe('exportEntriesCsv', () => {
    it('should export entries as CSV', async () => {
      mockPrisma.client.contentType.findFirst.mockResolvedValue({
        id: 'ct1',
        fields: JSON.stringify([
          { name: 'title', type: 'text' },
          { name: 'price', type: 'number' },
        ]),
      });
      mockPrisma.client.contentEntry.findMany.mockResolvedValue([
        { id: 'e1', slug: 'test', locale: 'en', status: 'PUBLISHED', version: 1, data: { title: 'Hello', price: 99 }, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const csv = await service.exportEntriesCsv('ct1');

      expect(csv).toContain('id,slug,locale,status,version,title,price');
      expect(csv).toContain('Hello');
      expect(csv).toContain('99');
    });

    it('should throw for unknown content type', async () => {
      mockPrisma.client.contentType.findFirst.mockResolvedValue(null);

      await expect(service.exportEntriesCsv('unknown')).rejects.toThrow('not found');
    });
  });

  describe('importAll', () => {
    it('should import content types and entries', async () => {
      // All findFirst return null (nothing exists yet)
      mockPrisma.client.contentLocale.findFirst.mockResolvedValue(null);
      mockPrisma.client.contentComponent.findFirst.mockResolvedValue(null);
      mockPrisma.client.contentType.findFirst.mockResolvedValue(null);
      mockPrisma.client.contentType.create.mockResolvedValue({ id: 'new-ct1' });
      mockPrisma.client.contentComponent.create.mockResolvedValue({ id: 'new-comp1' });
      mockPrisma.client.contentLocale.create.mockResolvedValue({ id: 'new-loc1' });
      mockPrisma.client.contentEntry.create.mockResolvedValue({ id: 'new-e1' });

      const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        locales: [{ code: 'en', name: 'English', isDefault: true }],
        components: [{ name: 'SEO', slug: 'seo', fields: [] }],
        contentTypes: [{ id: 'old-ct1', name: 'Blog', slug: 'blog', fields: [] }],
        entries: [{ contentTypeId: 'old-ct1', data: { title: 'Test' }, locale: 'en', status: 'DRAFT' }],
      };

      const result = await service.importAll(data);

      expect(result.locales.created).toBe(1);
      expect(result.components.created).toBe(1);
      expect(result.contentTypes.created).toBe(1);
      expect(result.entries.created).toBe(1);
    });

    it('should skip existing content types', async () => {
      mockPrisma.client.contentLocale.findFirst.mockResolvedValue(null);
      mockPrisma.client.contentComponent.findFirst.mockResolvedValue(null);
      mockPrisma.client.contentType.findFirst.mockResolvedValue({ id: 'existing', slug: 'blog' });
      mockPrisma.client.contentLocale.create.mockResolvedValue({});

      const data = {
        version: '1.0', exportedAt: '', locales: [],
        components: [], entries: [],
        contentTypes: [{ id: 'ct1', name: 'Blog', slug: 'blog', fields: [] }],
      };

      const result = await service.importAll(data);
      expect(result.contentTypes.skipped).toBe(1);
      expect(result.contentTypes.created).toBe(0);
    });
  });

  describe('importEntriesCsv', () => {
    it('should import entries from CSV', async () => {
      mockPrisma.client.contentEntry.create.mockResolvedValue({ id: 'new' });

      const csv = 'slug,locale,title,price\ntest,en,Hello,99\ntest2,vi,Xin chao,50';

      const result = await service.importEntriesCsv(csv, 'ct1');
      expect(result.created).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should throw for empty CSV', async () => {
      await expect(service.importEntriesCsv('header', 'ct1')).rejects.toThrow('at least 1 row');
    });
  });
});
