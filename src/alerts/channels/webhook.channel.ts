import { Logger } from '@nestjs/common';
import { AlertChannel, AlertPayload } from '../interfaces';

export class WebhookChannel implements AlertChannel {
  readonly name = 'webhook';
  private readonly logger = new Logger('AlertWebhook');

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  async send(alert: AlertPayload): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(alert),
      });

      if (!response.ok) {
        this.logger.warn(`Webhook returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Webhook delivery failed: ${(error as Error).message}`);
    }
  }
}
