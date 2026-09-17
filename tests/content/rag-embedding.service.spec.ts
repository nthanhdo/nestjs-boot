import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RagEmbeddingService } from '../../src/content/services/rag/rag-embedding.service';

describe('RagEmbeddingService', () => {
  let service: RagEmbeddingService;
  let mockPrisma: any;
  let mockChunking: any;
  let mockProvider: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        contentEntry: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        $executeRawUnsafe: vi.fn(),
        $queryRawUnsafe: vi.fn(),
      },
    };
    mockChunking = {
      extractAndChunk: vi.fn(),
    };
    mockProvider = {
      embed: vi.fn(),
      dimension: 1536,
    };
    service = new RagEmbeddingService(mockPrisma, mockChunking, mockProvider, {} as any);
  });

  describe('embedEntry', () => {
    it('should embed a single entry', async () => {
      mockPrisma.client.contentEntry.findFirst.mockResolvedValue({
        id: '1', data: { title: 'Test', body: 'Content' }, slug: 'test', locale: 'en',
      });
      mockChunking.extractAndChunk.mockReturnValue([
        { index: 0, text: 'Test Content', metadata: {} },
      ]);
      mockProvider.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockPrisma.client.$executeRawUnsafe.mockResolvedValue(1);

      const count = await service.embedEntry('1', 'tenant-1');

      expect(count).toBe(1);
      // Delete old embeddings
      expect(mockPrisma.client.$executeRawUnsafe).toHaveBeenCalledWith(
        'DELETE FROM content.content_embeddings WHERE entry_id = $1',
        '1',
      );
      // Insert new embedding
      expect(mockPrisma.client.$executeRawUnsafe).toHaveBeenCalledTimes(2); // delete + insert
    });

    it('should return 0 when entry not found', async () => {
      mockPrisma.client.contentEntry.findFirst.mockResolvedValue(null);

      const count = await service.embedEntry('nonexistent');
      expect(count).toBe(0);
    });

    it('should return 0 when no text to embed', async () => {
      mockPrisma.client.contentEntry.findFirst.mockResolvedValue({
        id: '1', data: {}, slug: 'empty', locale: 'en',
      });
      mockChunking.extractAndChunk.mockReturnValue([]);

      const count = await service.embedEntry('1');
      expect(count).toBe(0);
    });

    it('should handle multiple chunks', async () => {
      mockPrisma.client.contentEntry.findFirst.mockResolvedValue({
        id: '1', data: { body: 'Long content' }, slug: 'test', locale: 'en',
      });
      mockChunking.extractAndChunk.mockReturnValue([
        { index: 0, text: 'Chunk 1', metadata: {} },
        { index: 1, text: 'Chunk 2', metadata: {} },
        { index: 2, text: 'Chunk 3', metadata: {} },
      ]);
      mockProvider.embed.mockResolvedValue([
        [0.1, 0.2], [0.3, 0.4], [0.5, 0.6],
      ]);
      mockPrisma.client.$executeRawUnsafe.mockResolvedValue(1);

      const count = await service.embedEntry('1');
      expect(count).toBe(3);
      // 1 delete + 3 inserts
      expect(mockPrisma.client.$executeRawUnsafe).toHaveBeenCalledTimes(4);
    });
  });

  describe('embedAll', () => {
    it('should embed all published entries', async () => {
      mockPrisma.client.contentEntry.findMany.mockResolvedValue([
        { id: '1', data: { title: 'A' } },
        { id: '2', data: { title: 'B' } },
      ]);
      mockPrisma.client.contentEntry.findFirst
        .mockResolvedValueOnce({ id: '1', data: { title: 'A' }, slug: 'a', locale: 'en' })
        .mockResolvedValueOnce({ id: '2', data: { title: 'B' }, slug: 'b', locale: 'en' });
      mockChunking.extractAndChunk.mockReturnValue([{ index: 0, text: 'text', metadata: {} }]);
      mockProvider.embed.mockResolvedValue([[0.1, 0.2]]);
      mockPrisma.client.$executeRawUnsafe.mockResolvedValue(1);

      const result = await service.embedAll();
      expect(result.total).toBe(2);
      expect(result.embedded).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return embedding stats', async () => {
      mockPrisma.client.contentEntry.count.mockResolvedValue(10);
      mockPrisma.client.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: 8 }])
        .mockResolvedValueOnce([{ count: 15 }]);

      const stats = await service.getStats();
      expect(stats).toEqual({
        totalEntries: 10,
        embeddedEntries: 8,
        totalChunks: 15,
      });
    });
  });
});
