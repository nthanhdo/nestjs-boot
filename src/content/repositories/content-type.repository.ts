import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IContentType, ContentFieldDefinition } from '../interfaces';

@Injectable()
export class ContentTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    name: string;
    slug: string;
    description?: string;
    fields?: ContentFieldDefinition[];
    components?: string[];
    tenantId?: string;
  }): Promise<IContentType> {
    return this.prisma.client.contentType.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        fields: JSON.stringify(data.fields ?? []),
        components: data.components ?? [],
        tenantId: data.tenantId,
      },
    });
  }

  async findById(id: string, tenantId?: string): Promise<IContentType | null> {
    return this.prisma.client.contentType.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async findBySlug(slug: string, tenantId?: string): Promise<IContentType | null> {
    return this.prisma.client.contentType.findFirst({
      where: { slug, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async findAll(tenantId?: string): Promise<IContentType[]> {
    return this.prisma.client.contentType.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Partial<Pick<IContentType, 'name' | 'slug' | 'description' | 'fields' | 'components'>>,
    _tenantId?: string,
  ): Promise<IContentType> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.fields !== undefined) updateData.fields = JSON.stringify(data.fields);
    if (data.components !== undefined) updateData.components = data.components;

    return this.prisma.client.contentType.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string, _tenantId?: string): Promise<void> {
    await this.prisma.client.contentType.delete({
      where: { id },
    });
  }

  async slugExists(slug: string, tenantId?: string, excludeId?: string): Promise<boolean> {
    const count = await this.prisma.client.contentType.count({
      where: {
        slug,
        ...(tenantId ? { tenantId } : {}),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    return count > 0;
  }
}
