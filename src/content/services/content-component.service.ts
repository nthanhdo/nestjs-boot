import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ContentComponentRepository } from '../repositories/content-component.repository';
import type { IContentComponent, ContentFieldDefinition, ContentFieldType } from '../interfaces';

const VALID_FIELD_TYPES: ContentFieldType[] = [
  'text', 'textarea', 'richtext', 'number', 'boolean', 'date', 'datetime',
  'media', 'reference', 'json', 'enum', 'slug', 'url', 'email', 'color',
];

@Injectable()
export class ContentComponentService {
  constructor(private readonly componentRepo: ContentComponentRepository) {}

  async create(data: {
    name: string;
    slug: string;
    fields: ContentFieldDefinition[];
    tenantId?: string;
  }): Promise<IContentComponent> {
    const existing = await this.componentRepo.findBySlug(data.slug, data.tenantId);
    if (existing) throw new ConflictException(`Component slug "${data.slug}" already exists`);
    this.validateFields(data.fields);
    return this.componentRepo.create(data);
  }

  async findById(id: string, tenantId?: string): Promise<IContentComponent> {
    const comp = await this.componentRepo.findById(id, tenantId);
    if (!comp) throw new NotFoundException(`Component "${id}" not found`);
    return this.parseFields(comp);
  }

  async findAll(tenantId?: string): Promise<IContentComponent[]> {
    const comps = await this.componentRepo.findAll(tenantId);
    return comps.map((c) => this.parseFields(c));
  }

  async update(
    id: string,
    data: Partial<Pick<IContentComponent, 'name' | 'slug' | 'fields'>>,
    tenantId?: string,
  ): Promise<IContentComponent> {
    await this.findById(id, tenantId);
    if (data.fields) this.validateFields(data.fields);
    return this.componentRepo.update(id, data);
  }

  async delete(id: string, tenantId?: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.componentRepo.delete(id);
  }

  private validateFields(fields: ContentFieldDefinition[]): void {
    for (const field of fields) {
      if (!field.name || !field.type) {
        throw new BadRequestException('Each field must have a name and type');
      }
      // Components cannot contain nested components
      if (field.type === 'component') {
        throw new BadRequestException('Components cannot contain nested components');
      }
      if (!VALID_FIELD_TYPES.includes(field.type)) {
        throw new BadRequestException(`Invalid field type "${field.type}"`);
      }
    }
  }

  private parseFields(comp: IContentComponent): IContentComponent {
    if (typeof comp.fields === 'string') {
      return { ...comp, fields: JSON.parse(comp.fields) };
    }
    return comp;
  }
}
