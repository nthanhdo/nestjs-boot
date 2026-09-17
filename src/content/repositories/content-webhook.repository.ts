import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IContentWebhook, IContentWebhookLog } from '../interfaces';

@Injectable()
export class ContentWebhookRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    url: string;
    events: string[];
    secret: string;
    tenantId?: string;
  }): Promise<IContentWebhook> {
    return this.prisma.client.contentWebhook.create({ data });
  }

  async findById(id: string, tenantId?: string): Promise<IContentWebhook | null> {
    return this.prisma.client.contentWebhook.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async findAll(tenantId?: string): Promise<IContentWebhook[]> {
    return this.prisma.client.contentWebhook.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByEvent(event: string, tenantId?: string): Promise<IContentWebhook[]> {
    return this.prisma.client.contentWebhook.findMany({
      where: {
        active: true,
        events: { has: event },
        ...(tenantId ? { tenantId } : {}),
      },
    });
  }

  async update(id: string, data: Partial<Pick<IContentWebhook, 'url' | 'events' | 'secret' | 'active'>>): Promise<IContentWebhook> {
    return this.prisma.client.contentWebhook.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.contentWebhook.delete({ where: { id } });
  }

  async createLog(data: {
    webhookId: string;
    event: string;
    payload: Record<string, unknown>;
    responseStatus?: number;
    attempt?: number;
  }): Promise<IContentWebhookLog> {
    return this.prisma.client.contentWebhookLog.create({
      data: {
        webhookId: data.webhookId,
        event: data.event,
        payload: data.payload,
        responseStatus: data.responseStatus ?? null,
        attempt: data.attempt ?? 1,
      },
    });
  }

  async findLogs(webhookId: string, page = 1, pageSize = 25): Promise<{ data: IContentWebhookLog[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.client.contentWebhookLog.findMany({
        where: { webhookId },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.contentWebhookLog.count({ where: { webhookId } }),
    ]);
    return { data, total };
  }
}
