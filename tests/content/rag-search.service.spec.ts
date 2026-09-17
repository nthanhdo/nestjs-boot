import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RagSearchService } from '../../src/content/services/rag/rag-search.service';

describe('RagSearchService', () => {
  let service: RagSearchService;
  let mockPrisma: any;
  let mockProvider: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        $queryRawUnsafe: vi.fn(),
      },
    };
    mockProvider = {
      embed: vi.fn(),
      dimension: 1536,
    };
    service = new RagSearchService(mockPrisma, mockProvider, {
      rag: { enabled: true, embeddingProvider: 'openai', similarityThreshold: 0.7, vectorWeight: 0.7 },
      defaultPageSize: 25,
    } as any);
  });

  describe('semanticSearch', () => {
    it('should embed query and search by vector similarity', async () => {
      mockProvider.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockPrisma.client.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: '1', slug: 'test', score: 0.92, status: 'PUBLISHED', data: {} },
        ])
        .mockResolvedValueOnce([{ total: 1 }]);

      const result = await service.semanticSearch({ query: 'test query' });

      expect(mockProvider.embed).toHaveBeenCalledWith(['test query']);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].score).toBe(0.92);
      expect(result.meta.total).toBe(1);
    });

    it('should pass tenant filter', async () => {
      mockProvider.embed.mockResolvedValue([[0.1]]);
      mockPrisma.client.$queryRawUnsafe.mockResolvedValue([]);

      await service.semanticSearch({ query: 'test', tenantId: 'tenant-1' });

      const sql = mockPrisma.client.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('tenant_id');
    });

    it('should return empty on error', async () => {
      mockProvider.embed.mockResolvedValue([[0.1]]);
      mockPrisma.client.$queryRawUnsafe.mockRejectedValue(new Error('DB error'));

      const result = await service.semanticSearch({ query: 'test' });
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should respect pagination', async () => {
      mockProvider.embed.mockResolvedValue([[0.1]]);
      mockPrisma.client.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      await service.semanticSearch({ query: 'test', page: 2, pageSize: 10 });

      const sql = mockPrisma.client.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('OFFSET');
    });
  });

  describe('hybridSearch', () => {
    it('should combine vector and keyword search', async () => {
      mockProvider.embed.mockResolvedValue([[0.1, 0.2]]);
      mockPrisma.client.$queryRawUnsafe.mockResolvedValue([
        { id: '1', score: 0.85, status: 'PUBLISHED', data: {} },
      ]);

      const result = await service.hybridSearch({ query: 'nestjs boot' });

      expect(mockProvider.embed).toHaveBeenCalledWith(['nestjs boot']);
      expect(result.data).toHaveLength(1);
      const sql = mockPrisma.client.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('semantic');
      expect(sql).toContain('keyword');
      expect(sql).toContain('to_tsvector');
    });

    it('should return empty on error', async () => {
      mockProvider.embed.mockResolvedValue([[0.1]]);
      mockPrisma.client.$queryRawUnsafe.mockRejectedValue(new Error('fail'));

      const result = await service.hybridSearch({ query: 'test' });
      expect(result.data).toEqual([]);
    });
  });
});
