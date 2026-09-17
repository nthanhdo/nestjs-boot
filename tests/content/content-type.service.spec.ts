import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentTypeService } from '../../src/content/services/content-type.service';
import type { ContentFieldDefinition } from '../../src/content/interfaces';

describe('ContentTypeService', () => {
  let service: ContentTypeService;
  let mockTypeRepo: any;
  let mockComponentRepo: any;

  beforeEach(() => {
    mockTypeRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAll: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      slugExists: vi.fn(),
    };
    mockComponentRepo = {
      findBySlug: vi.fn(),
    };
    service = new ContentTypeService(mockTypeRepo, mockComponentRepo);
  });

  describe('create', () => {
    it('should create a content type', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(false);
      mockTypeRepo.create.mockResolvedValue({ id: '1', name: 'Blog Post', slug: 'blog-post', fields: [] });

      const result = await service.create({ name: 'Blog Post', slug: 'blog-post' });

      expect(result.slug).toBe('blog-post');
      expect(mockTypeRepo.create).toHaveBeenCalledOnce();
    });

    it('should throw on duplicate slug', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(true);

      await expect(service.create({ name: 'Blog', slug: 'blog-post' }))
        .rejects.toThrow('already exists');
    });

    it('should validate field types', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(false);

      const fields: ContentFieldDefinition[] = [
        { name: 'title', label: 'Title', type: 'invalid' as any },
      ];

      await expect(service.create({ name: 'Test', slug: 'test', fields }))
        .rejects.toThrow('Invalid field type');
    });

    it('should reject duplicate field names', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(false);

      const fields: ContentFieldDefinition[] = [
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'title', label: 'Title 2', type: 'textarea' },
      ];

      await expect(service.create({ name: 'Test', slug: 'test', fields }))
        .rejects.toThrow('Duplicate field name');
    });

    it('should require options for enum fields', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(false);

      const fields: ContentFieldDefinition[] = [
        { name: 'status', label: 'Status', type: 'enum' },
      ];

      await expect(service.create({ name: 'Test', slug: 'test', fields }))
        .rejects.toThrow('must have options');
    });

    it('should require componentSlug for component fields', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(false);

      const fields: ContentFieldDefinition[] = [
        { name: 'seo', label: 'SEO', type: 'component' },
      ];

      await expect(service.create({ name: 'Test', slug: 'test', fields }))
        .rejects.toThrow('must specify componentSlug');
    });

    it('should require slugSource for slug fields', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(false);

      const fields: ContentFieldDefinition[] = [
        { name: 'slug', label: 'Slug', type: 'slug' },
      ];

      await expect(service.create({ name: 'Test', slug: 'test', fields }))
        .rejects.toThrow('must specify slugSource');
    });

    it('should validate component references exist', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(false);
      mockComponentRepo.findBySlug.mockResolvedValue(null);

      await expect(service.create({ name: 'Test', slug: 'test', components: ['seo-block'] }))
        .rejects.toThrow('Component "seo-block" not found');
    });

    it('should accept valid fields', async () => {
      mockTypeRepo.slugExists.mockResolvedValue(false);
      mockTypeRepo.create.mockResolvedValue({ id: '1', fields: [] });

      const fields: ContentFieldDefinition[] = [
        { name: 'title', label: 'Title', type: 'text', validation: { required: true, maxLength: 255 } },
        { name: 'body', label: 'Body', type: 'richtext' },
        { name: 'count', label: 'Count', type: 'number' },
        { name: 'active', label: 'Active', type: 'boolean' },
        { name: 'category', label: 'Category', type: 'enum', enumConfig: { options: [{ label: 'A', value: 'a' }] } },
        { name: 'slug', label: 'Slug', type: 'slug', slugSource: 'title' },
      ];

      await expect(service.create({ name: 'Test', slug: 'test', fields })).resolves.toBeDefined();
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when not found', async () => {
      mockTypeRepo.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow('not found');
    });

    it('should parse JSON string fields', async () => {
      const fields = [{ name: 'title', label: 'Title', type: 'text' }];
      mockTypeRepo.findById.mockResolvedValue({
        id: '1',
        fields: JSON.stringify(fields),
      });

      const result = await service.findById('1');
      expect(result.fields).toEqual(fields);
    });
  });

  describe('addField', () => {
    it('should add a field to existing type', async () => {
      mockTypeRepo.findById.mockResolvedValue({ id: '1', fields: [{ name: 'title', type: 'text' }] });
      mockTypeRepo.update.mockImplementation((id: string, data: any) => ({
        id,
        fields: data.fields,
      }));

      const result = await service.addField('1', { name: 'body', label: 'Body', type: 'richtext' });

      expect(mockTypeRepo.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ name: 'body' })]) }),
        undefined,
      );
    });

    it('should reject duplicate field name', async () => {
      mockTypeRepo.findById.mockResolvedValue({ id: '1', fields: [{ name: 'title', type: 'text' }] });

      await expect(service.addField('1', { name: 'title', label: 'Title', type: 'text' }))
        .rejects.toThrow('already exists');
    });
  });

  describe('removeField', () => {
    it('should remove a field', async () => {
      mockTypeRepo.findById.mockResolvedValue({
        id: '1',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'body', type: 'richtext' },
        ],
      });
      mockTypeRepo.update.mockImplementation((id: string, data: any) => ({
        id,
        fields: data.fields,
      }));

      await service.removeField('1', 'body');

      expect(mockTypeRepo.update).toHaveBeenCalledWith(
        '1',
        { fields: [{ name: 'title', type: 'text' }] },
        undefined,
      );
    });
  });
});
