import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentReferenceService } from '../../src/content/services/content-reference.service';

describe('ContentReferenceService', () => {
  let service: ContentReferenceService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        contentEntry: { findFirst: vi.fn() },
        contentType: { findFirst: vi.fn() },
      },
    };
    service = new ContentReferenceService(mockPrisma, { maxPopulateDepth: 3 } as any);
  });

  it('should resolve single reference field', async () => {
    const referencedEntry = { id: 'ref-1', data: { name: 'Author' }, status: 'PUBLISHED' };
    mockPrisma.client.contentEntry.findFirst.mockResolvedValue(referencedEntry);

    const entry = {
      id: 'e1', contentTypeId: 'ct1', data: { title: 'Post', author: 'ref-1' },
      locale: 'en', status: 'PUBLISHED', version: 1,
    } as any;

    const type = {
      id: 'ct1', fields: [
        { name: 'title', type: 'text' },
        { name: 'author', type: 'reference' },
      ],
    } as any;

    const result = await service.resolveReferences(entry, type, ['author']);
    expect(result.data.author).toEqual(referencedEntry);
  });

  it('should resolve multiple reference field', async () => {
    const tag1 = { id: 't1', data: { name: 'Tag 1' }, status: 'PUBLISHED' };
    const tag2 = { id: 't2', data: { name: 'Tag 2' }, status: 'PUBLISHED' };
    mockPrisma.client.contentEntry.findFirst
      .mockResolvedValueOnce(tag1)
      .mockResolvedValueOnce(tag2);

    const entry = {
      id: 'e1', contentTypeId: 'ct1', data: { tags: ['t1', 't2'] },
      locale: 'en', status: 'PUBLISHED', version: 1,
    } as any;

    const type = {
      id: 'ct1', fields: [
        { name: 'tags', type: 'reference', referenceConfig: { multiple: true } },
      ],
    } as any;

    const result = await service.resolveReferences(entry, type, ['tags']);
    expect(result.data.tags).toEqual([tag1, tag2]);
  });

  it('should not resolve non-reference fields', async () => {
    const entry = {
      id: 'e1', contentTypeId: 'ct1', data: { title: 'Hello' },
      locale: 'en', status: 'PUBLISHED', version: 1,
    } as any;

    const type = {
      id: 'ct1', fields: [{ name: 'title', type: 'text' }],
    } as any;

    const result = await service.resolveReferences(entry, type, ['title']);
    expect(result.data.title).toBe('Hello');
    expect(mockPrisma.client.contentEntry.findFirst).not.toHaveBeenCalled();
  });

  it('should respect max depth', async () => {
    const service2 = new ContentReferenceService(mockPrisma, { maxPopulateDepth: 1 } as any);

    const entry = {
      id: 'e1', contentTypeId: 'ct1', data: { ref: 'ref-1' },
      locale: 'en', status: 'PUBLISHED', version: 1,
    } as any;

    const refEntry = { id: 'ref-1', contentTypeId: 'ct2', data: { nested: 'ref-2' }, status: 'PUBLISHED' };
    mockPrisma.client.contentEntry.findFirst.mockResolvedValue(refEntry);

    const type = {
      id: 'ct1', fields: [{ name: 'ref', type: 'reference' }],
    } as any;

    const result = await service2.resolveReferences(entry, type, ['ref'], 0);
    // Should resolve first level but not recurse further
    expect(result.data.ref).toEqual(refEntry);
  });

  it('should handle null references gracefully', async () => {
    const entry = {
      id: 'e1', contentTypeId: 'ct1', data: { author: null },
      locale: 'en', status: 'PUBLISHED', version: 1,
    } as any;

    const type = {
      id: 'ct1', fields: [{ name: 'author', type: 'reference' }],
    } as any;

    const result = await service.resolveReferences(entry, type, ['author']);
    expect(result.data.author).toBeNull();
  });

  it('should handle missing referenced entry', async () => {
    mockPrisma.client.contentEntry.findFirst.mockResolvedValue(null);

    const entry = {
      id: 'e1', contentTypeId: 'ct1', data: { author: 'nonexistent' },
      locale: 'en', status: 'PUBLISHED', version: 1,
    } as any;

    const type = {
      id: 'ct1', fields: [{ name: 'author', type: 'reference' }],
    } as any;

    const result = await service.resolveReferences(entry, type, ['author']);
    expect(result.data.author).toBeNull();
  });

  it('should parse JSON string fields', async () => {
    const entry = {
      id: 'e1', contentTypeId: 'ct1', data: { title: 'Test' },
      locale: 'en', status: 'PUBLISHED', version: 1,
    } as any;

    const type = {
      id: 'ct1', fields: JSON.stringify([{ name: 'title', type: 'text' }]),
    } as any;

    const result = await service.resolveReferences(entry, type, ['title']);
    expect(result.data.title).toBe('Test');
  });
});
