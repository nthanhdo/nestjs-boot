import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ContentWebhookRepository } from '../repositories/content-webhook.repository';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';
import type { IContentWebhook } from '../interfaces';

export interface ContentEvent {
  type: string;
  payload: Record<string, unknown>;
  tenantId?: string;
  timestamp: Date;
}

@Injectable()
export class ContentWebhookService {
  private readonly logger = new Logger(ContentWebhookService.name);

  constructor(
    private readonly webhookRepo: ContentWebhookRepository,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
  ) {}

  /**
   * Dispatch event to all matching webhooks.
   * Non-blocking — fires and forgets with retry.
   */
  async dispatch(event: ContentEvent): Promise<void> {
    if (!this.options.enableWebhooks) return;

    const webhooks = await this.webhookRepo.findByEvent(event.type, event.tenantId);
    if (!webhooks.length) return;

    // Fire all webhook deliveries in parallel (non-blocking)
    for (const webhook of webhooks) {
      this.deliverWithRetry(webhook, event).catch((err) => {
        this.logger.error(`Webhook delivery failed for ${webhook.id}: ${err}`);
      });
    }
  }

  private async deliverWithRetry(webhook: IContentWebhook, event: ContentEvent): Promise<void> {
    const maxAttempts = this.options.webhookRetryAttempts ?? 3;
    const payload = {
      event: event.type,
      data: event.payload,
      timestamp: event.timestamp.toISOString(),
      tenantId: event.tenantId,
    };
    const body = JSON.stringify(payload);
    const signature = this.sign(body, webhook.secret);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Content-Signature': `sha256=${signature}`,
            'X-Content-Event': event.type,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });

        await this.webhookRepo.createLog({
          webhookId: webhook.id,
          event: event.type,
          payload,
          responseStatus: response.status,
          attempt,
        });

        if (response.ok) {
          this.logger.debug(`Webhook ${webhook.id} delivered (attempt ${attempt}): ${response.status}`);
          return;
        }

        this.logger.warn(`Webhook ${webhook.id} returned ${response.status} (attempt ${attempt}/${maxAttempts})`);
      } catch (err) {
        await this.webhookRepo.createLog({
          webhookId: webhook.id,
          event: event.type,
          payload,
          responseStatus: 0,
          attempt,
        });

        this.logger.warn(`Webhook ${webhook.id} failed (attempt ${attempt}/${maxAttempts}): ${err}`);
      }

      // Exponential backoff: 1s, 10s, 60s
      if (attempt < maxAttempts) {
        const delay = Math.pow(10, attempt - 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    this.logger.error(`Webhook ${webhook.id} exhausted all ${maxAttempts} retries for event "${event.type}"`);
  }

  private sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /** Verify incoming webhook signature */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return signature === `sha256=${expected}`;
  }
}
