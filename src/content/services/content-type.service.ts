import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ContentTypeRepository } from '../repositories/content-type.repository';
import { ContentComponentRepository } from '../repositories/content-component.repository';
import type { IContentType, ContentFieldDefinition, ContentFieldType } from '../interfaces';

const VALID_FIELD_TYPES: ContentFieldType[] = [
  'text', 'textarea', 'richtext', 'number', 'boolean', 'date', 'datetime',
  'media', 'reference', 'json', 'enum', 'slug', 'url', 'email', 'color', 'component',
];

@Injectable()
export class ContentTypeService {
  constructor(
    private readonly typeRepo: ContentTypeRepository,
    private readonly componentRepo: ContentComponentRepository,
  ) {}

  async create(data: {
    name: string;
    slug: string;
    description?: string;
    fields?: ContentFieldDefinition[];
    components?: string[];
    tenantId?: string;
  }): Promise<IContentType> {
    if (await this.typeRepo.slugExists(data.slug, data.tenantId)) {
      throw new ConflictException(`Content type slug "${data.slug}" already exists`);
    }
    if (data.fields) this.validateFields(data.fields);
    if (data.components?.length) {
      await this.validateComponents(data.components, data.tenantId);
    }
    return this.typeRepo.create(data);
  }

  async findById(id: string, tenantId?: string): Promise<IContentType> {
    const type = await this.typeRepo.findById(id, tenantId);
    if (!type) throw new NotFoundException(`Content type "${id}" not found`);
    return this.parseFields(type);
  }

  async findBySlug(slug: string, tenantId?: string): Promise<IContentType> {
    const type = await this.typeRepo.findBySlug(slug, tenantId);
    if (!type) throw new NotFoundException(`Content type "${slug}" not found`);
    return this.parseFields(type);
  }

  async findAll(tenantId?: string): Promise<IContentType[]> {
    const types = await this.typeRepo.findAll(tenantId);
    return types.map((t) => this.parseFields(t));
  }

  async update(
    id: string,
    data: Partial<Pick<IContentType, 'name' | 'slug' | 'description' | 'fields' | 'components'>>,
    tenantId?: string,
  ): Promise<IContentType> {
    await this.findById(id, tenantId);
    if (data.slug && await this.typeRepo.slugExists(data.slug, tenantId, id)) {
      throw new ConflictException(`Content type slug "${data.slug}" already exists`);
    }
    if (data.fields) this.validateFields(data.fields);
    if (data.components?.length) {
      await this.validateComponents(data.components, tenantId);
    }
    return this.typeRepo.update(id, data, tenantId);
  }

  async delete(id: string, tenantId?: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.typeRepo.delete(id, tenantId);
  }

  /** Add a single field to existing content type */
  async addField(id: string, field: ContentFieldDefinition, tenantId?: string): Promise<IContentType> {
    const type = await this.findById(id, tenantId);
    const fields = Array.isArray(type.fields) ? type.fields : [];
    if (fields.some((f) => f.name === field.name)) {
      throw new ConflictException(`Field "${field.name}" already exists`);
    }
    this.validateFields([field]);
    fields.push({ ...field, order: field.order ?? fields.length });
    return this.typeRepo.update(id, { fields }, tenantId);
  }

  /** Update a single field */
  async updateField(id: string, fieldName: string, updates: Partial<ContentFieldDefinition>, tenantId?: string): Promise<IContentType> {
    const type = await this.findById(id, tenantId);
    const fields = Array.isArray(type.fields) ? [...type.fields] : [];
    const idx = fields.findIndex((f) => f.name === fieldName);
    if (idx === -1) throw new NotFoundException(`Field "${fieldName}" not found`);
    fields[idx] = { ...fields[idx], ...updates };
    this.validateFields(fields);
    return this.typeRepo.update(id, { fields }, tenantId);
  }

  /** Remove a single field */
  async removeField(id: string, fieldName: string, tenantId?: string): Promise<IContentType> {
    const type = await this.findById(id, tenantId);
    const fields = Array.isArray(type.fields) ? type.fields.filter((f) => f.name !== fieldName) : [];
    return this.typeRepo.update(id, { fields }, tenantId);
  }

  private validateFields(fields: ContentFieldDefinition[]): void {
    const names = new Set<string>();
    for (const field of fields) {
      if (!field.name || !field.type) {
        throw new BadRequestException('Each field must have a name and type');
      }
      if (!VALID_FIELD_TYPES.includes(field.type)) {
        throw new BadRequestException(`Invalid field type "${field.type}". Valid: ${VALID_FIELD_TYPES.join(', ')}`);
      }
      if (names.has(field.name)) {
        throw new BadRequestException(`Duplicate field name "${field.name}"`);
      }
      names.add(field.name);

      if (field.type === 'enum' && !field.enumConfig?.options?.length) {
        throw new BadRequestException(`Enum field "${field.name}" must have options`);
      }
      if (field.type === 'component' && !field.componentSlug) {
        throw new BadRequestException(`Component field "${field.name}" must specify componentSlug`);
      }
      if (field.type === 'slug' && !field.slugSource) {
        throw new BadRequestException(`Slug field "${field.name}" must specify slugSource`);
      }
    }
  }

  private async validateComponents(slugs: string[], tenantId?: string): Promise<void> {
    for (const slug of slugs) {
      const comp = await this.componentRepo.findBySlug(slug, tenantId);
      if (!comp) throw new NotFoundException(`Component "${slug}" not found`);
    }
  }

  private parseFields(type: IContentType): IContentType {
    if (typeof type.fields === 'string') {
      return { ...type, fields: JSON.parse(type.fields) };
    }
    return type;
  }
}
