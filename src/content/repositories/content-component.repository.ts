import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IContentComponent, ContentFieldDefinition } from '../interfaces';

@Injectable()
export class ContentComponentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    name: string;
    slug: string;
    fields: ContentFieldDefinition[];
    tenantId?: string;
  }): Promise<IContentComponent> {
    return this.prisma.client.contentComponent.create({
      data: {
        name: data.name,
        slug: data.slug,
        fields: JSON.stringify(data.fields),
        tenantId: data.tenantId,
      },
    });
  }

  async findById(id: string, tenantId?: string): Promise<IContentComponent | null> {
    return this.prisma.client.contentComponent.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async findBySlug(slug: string, tenantId?: string): Promise<IContentComponent | null> {
    return this.prisma.client.contentComponent.findFirst({
      where: { slug, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async findAll(tenantId?: string): Promise<IContentComponent[]> {
    return this.prisma.client.contentComponent.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Partial<Pick<IContentComponent, 'name' | 'slug' | 'fields'>>,
  ): Promise<IContentComponent> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.fields !== undefined) updateData.fields = JSON.stringify(data.fields);

    return this.prisma.client.contentComponent.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.contentComponent.delete({ where: { id } });
  }
}
