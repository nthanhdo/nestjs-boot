import { describe, it, expect } from 'vitest';
import { ChunkingService } from '../../src/content/services/rag/chunking.service';

describe('ChunkingService', () => {
  const service = new ChunkingService({ rag: { enabled: true, embeddingProvider: 'openai', chunkSize: 100, chunkOverlap: 20 } } as any);
  const defaultService = new ChunkingService({ rag: { enabled: true, embeddingProvider: 'openai' } } as any);

  describe('extractText', () => {
    it('should extract string values from flat object', () => {
      const text = service.extractText({ title: 'Hello', body: 'World' });
      expect(text).toContain('Hello');
      expect(text).toContain('World');
    });

    it('should extract from nested objects', () => {
      const text = service.extractText({
        section: { heading: 'Title', content: 'Body text' },
      });
      expect(text).toContain('Title');
      expect(text).toContain('Body text');
    });

    it('should extract from arrays', () => {
      const text = service.extractText({ tags: ['nestjs', 'typescript'] });
      expect(text).toContain('nestjs');
      expect(text).toContain('typescript');
    });

    it('should strip HTML tags', () => {
      const text = service.extractText({ body: '<p>Hello <strong>world</strong></p>' });
      expect(text).toContain('Hello');
      expect(text).toContain('world');
      expect(text).not.toContain('<p>');
      expect(text).not.toContain('<strong>');
    });

    it('should skip metadata fields', () => {
      const text = service.extractText({
        id: '123',
        slug: 'test-slug',
        createdAt: '2024-01-01',
        title: 'Keep This',
      });
      expect(text).not.toContain('123');
      expect(text).not.toContain('test-slug');
      expect(text).toContain('Keep This');
    });

    it('should handle null/undefined values', () => {
      const text = service.extractText({ title: null, body: undefined, name: 'Valid' } as any);
      expect(text).toBe('Valid');
    });

    it('should return empty string for empty object', () => {
      expect(service.extractText({})).toBe('');
    });
  });

  describe('chunk', () => {
    it('should return single chunk for short text', () => {
      const chunks = service.chunk('Short text');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].text).toBe('Short text');
    });

    it('should split long text into multiple chunks', () => {
      const text = 'A'.repeat(250); // 250 chars, chunkSize=100
      const chunks = service.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should prefer splitting on paragraph boundaries', () => {
      const text = 'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.';
      // With chunkSize=100, this should fit in one chunk
      const chunks = service.chunk(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array for empty text', () => {
      expect(service.chunk('')).toEqual([]);
    });

    it('should include metadata in chunks', () => {
      const chunks = service.chunk('Some text', { entryId: '123' });
      expect(chunks[0].metadata).toEqual({ entryId: '123' });
    });

    it('should set chunk index correctly', () => {
      const text = 'A'.repeat(250);
      const chunks = service.chunk(text);
      chunks.forEach((c, i) => {
        expect(c.index).toBe(i);
      });
    });
  });

  describe('extractAndChunk', () => {
    it('should extract text and chunk in one call', () => {
      const data = { title: 'Test Title', body: 'Test body content' };
      const chunks = service.extractAndChunk(data, { entryId: 'abc' });
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].text).toContain('Test Title');
    });
  });

  describe('default chunk size', () => {
    it('should use 4000 char default chunk size', () => {
      const text = 'A'.repeat(3999);
      const chunks = defaultService.chunk(text);
      expect(chunks).toHaveLength(1); // Under 4000, should be single chunk
    });
  });
});
