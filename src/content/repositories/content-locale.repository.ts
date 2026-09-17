import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IContentLocale } from '../interfaces';

@Injectable()
export class ContentLocaleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    code: string;
    name: string;
    isDefault?: boolean;
    fallbackLocale?: string;
    tenantId?: string;
  }): Promise<IContentLocale> {
    return this.prisma.client.contentLocale.create({ data });
  }

  async findAll(tenantId?: string): Promise<IContentLocale[]> {
    return this.prisma.client.contentLocale.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { isDefault: 'desc' },
    });
  }

  async findByCode(code: string, tenantId?: string): Promise<IContentLocale | null> {
    return this.prisma.client.contentLocale.findFirst({
      where: { code, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async findDefault(tenantId?: string): Promise<IContentLocale | null> {
    return this.prisma.client.contentLocale.findFirst({
      where: { isDefault: true, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async update(id: string, data: Partial<Pick<IContentLocale, 'name' | 'isDefault' | 'fallbackLocale'>>): Promise<IContentLocale> {
    return this.prisma.client.contentLocale.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.contentLocale.delete({ where: { id } });
  }
}
