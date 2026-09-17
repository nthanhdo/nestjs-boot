import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IContentApiKey } from '../interfaces';

@Injectable()
export class ContentApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  static hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  async create(data: {
    keyHash: string;
    name: string;
    environment?: string;
    permissions?: Record<string, unknown>;
    tenantId?: string;
  }): Promise<IContentApiKey> {
    return this.prisma.client.contentApiKey.create({
      data: {
        keyHash: data.keyHash,
        name: data.name,
        environment: data.environment ?? 'development',
        permissions: data.permissions ?? {},
        tenantId: data.tenantId,
      },
    });
  }

  async findByHash(keyHash: string): Promise<IContentApiKey | null> {
    return this.prisma.client.contentApiKey.findFirst({
      where: { keyHash },
    });
  }

  async findAll(tenantId?: string): Promise<IContentApiKey[]> {
    return this.prisma.client.contentApiKey.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Partial<Pick<IContentApiKey, 'name' | 'environment' | 'permissions'>>): Promise<IContentApiKey> {
    return this.prisma.client.contentApiKey.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.contentApiKey.delete({ where: { id } });
  }
}
