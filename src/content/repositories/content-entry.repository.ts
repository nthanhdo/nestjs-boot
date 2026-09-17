import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IContentEntry, ContentPaginatedResult, ContentEntryFilters } from '../interfaces';
// EntryStatus used as string values at runtime

@Injectable()
export class ContentEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    contentTypeId: string;
    data: Record<string, unknown>;
    locale: string;
    slug?: string;
    tenantId?: string;
    createdBy?: string;
  }): Promise<IContentEntry> {
    return this.prisma.client.contentEntry.create({
      data: {
        contentTypeId: data.contentTypeId,
        data: data.data,
        locale: data.locale,
        slug: data.slug,
        tenantId: data.tenantId,
        createdBy: data.createdBy,
      },
    });
  }

  async findById(id: string, tenantId?: string): Promise<IContentEntry | null> {
    return this.prisma.client.contentEntry.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async findBySlug(slug: string, locale: string, tenantId?: string): Promise<IContentEntry | null> {
    return this.prisma.client.contentEntry.findFirst({
      where: {
        slug,
        locale,
        ...(tenantId ? { tenantId } : {}),
      },
    });
  }

  async findAll(
    filters: ContentEntryFilters & { tenantId?: string },
    defaultPageSize: number,
  ): Promise<ContentPaginatedResult<IContentEntry>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? defaultPageSize;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.contentTypeId) where.contentTypeId = filters.contentTypeId;
    if (filters.locale) where.locale = filters.locale;
    if (filters.status) where.status = filters.status;
    if (filters.createdBy) where.createdBy = filters.createdBy;

    // Content type slug filter
    if (filters.contentTypeSlug) {
      where.contentType = { slug: filters.contentTypeSlug };
    }

    const orderBy = this.parseSort(filters.sort);

    const [data, total] = await Promise.all([
      this.prisma.client.contentEntry.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: filters.populate?.includes('contentType') ? { contentType: true } : undefined,
      }),
      this.prisma.client.contentEntry.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async update(id: string, data: Partial<IContentEntry>): Promise<IContentEntry> {
    const updateData: Record<string, unknown> = {};
    if (data.data !== undefined) updateData.data = data.data;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.version !== undefined) updateData.version = data.version;
    if (data.publishedAt !== undefined) updateData.publishedAt = data.publishedAt;
    if (data.scheduledAt !== undefined) updateData.scheduledAt = data.scheduledAt;

    return this.prisma.client.contentEntry.update({
      where: { id },
      data: updateData,
    });
  }

  async softDelete(id: string): Promise<IContentEntry> {
    return this.prisma.client.contentEntry.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.prisma.client.contentEntry.delete({ where: { id } });
  }

  async findScheduledEntries(before: Date): Promise<IContentEntry[]> {
    return this.prisma.client.contentEntry.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: before },
      },
    });
  }

  async countByType(contentTypeId: string, tenantId?: string): Promise<number> {
    return this.prisma.client.contentEntry.count({
      where: {
        contentTypeId,
        ...(tenantId ? { tenantId } : {}),
      },
    });
  }

  private parseSort(sort?: string): Record<string, string>[] {
    if (!sort) return [{ createdAt: 'desc' }];
    return sort.split(',').map((s) => {
      const [field, dir] = s.split(':');
      return { [field]: dir === 'asc' ? 'asc' : 'desc' };
    });
  }
}
