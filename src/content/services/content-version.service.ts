import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IContentEntryVersion } from '../interfaces';

@Injectable()
export class ContentVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async createVersion(
    entryId: string,
    version: number,
    data: Record<string, unknown>,
    changedBy?: string,
  ): Promise<IContentEntryVersion> {
    return this.prisma.client.contentEntryVersion.create({
      data: { entryId, version, data, changedBy },
    });
  }

  async findVersions(entryId: string): Promise<IContentEntryVersion[]> {
    return this.prisma.client.contentEntryVersion.findMany({
      where: { entryId },
      orderBy: { version: 'desc' },
    });
  }

  async findVersion(entryId: string, version: number): Promise<IContentEntryVersion> {
    const v = await this.prisma.client.contentEntryVersion.findFirst({
      where: { entryId, version },
    });
    if (!v) throw new NotFoundException(`Version ${version} not found for entry "${entryId}"`);
    return v;
  }

  async rollback(entryId: string, version: number): Promise<Record<string, unknown>> {
    const v = await this.findVersion(entryId, version);
    return v.data as Record<string, unknown>;
  }
}
