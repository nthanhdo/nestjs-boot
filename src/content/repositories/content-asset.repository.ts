import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IContentAsset, ContentPaginatedResult } from '../interfaces';

@Injectable()
export class ContentAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    filename: string;
    mimeType: string;
    size: number;
    storageKey: string;
    folder?: string;
    tags?: string[];
    altText?: Record<string, string>;
    tenantId?: string;
  }): Promise<IContentAsset> {
    return this.prisma.client.contentAsset.create({
      data: {
        filename: data.filename,
        mimeType: data.mimeType,
        size: BigInt(data.size),
        storageKey: data.storageKey,
        folder: data.folder,
        tags: data.tags ?? [],
        altText: data.altText ?? null,
        tenantId: data.tenantId,
      },
    });
  }

  async findById(id: string, tenantId?: string): Promise<IContentAsset | null> {
    return this.prisma.client.contentAsset.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async findAll(
    filters: { tenantId?: string; folder?: string; mimeType?: string; tags?: string[] },
    page = 1,
    pageSize = 25,
  ): Promise<ContentPaginatedResult<IContentAsset>> {
    const skip = (page - 1) * pageSize;
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.folder) where.folder = filters.folder;
    if (filters.mimeType) where.mimeType = { startsWith: filters.mimeType };
    if (filters.tags?.length) where.tags = { hasSome: filters.tags };

    const [data, total] = await Promise.all([
      this.prisma.client.contentAsset.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.contentAsset.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async update(id: string, data: Partial<Pick<IContentAsset, 'filename' | 'folder' | 'tags' | 'altText'>>): Promise<IContentAsset> {
    return this.prisma.client.contentAsset.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.contentAsset.delete({ where: { id } });
  }

  async distinctFolders(tenantId?: string): Promise<string[]> {
    const rows = await this.prisma.client.contentAsset.findMany({
      where: { ...(tenantId ? { tenantId } : {}), folder: { not: null } },
      distinct: ['folder'],
      select: { folder: true },
      orderBy: { folder: 'asc' },
    });
    return rows.map((r: { folder: string | null }) => r.folder!).filter(Boolean);
  }

  async distinctTags(tenantId?: string): Promise<string[]> {
    const rows: { tag: string }[] = await this.prisma.client.$queryRawUnsafe(
      `SELECT DISTINCT unnest(tags) AS tag FROM content.content_assets WHERE ($1::text IS NULL OR tenant_id = $1) ORDER BY tag`,
      tenantId ?? null,
    );
    return rows.map((r: { tag: string }) => r.tag);
  }
}
