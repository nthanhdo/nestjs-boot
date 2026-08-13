import { Logger } from '@nestjs/common';
import { AlertChannel, AlertPayload } from '../interfaces';

const SEVERITY_EMOJI: Record<string, string> = {
  info: ':information_source:',
  warning: ':warning:',
  critical: ':rotating_light:',
};

export class SlackChannel implements AlertChannel {
  readonly name = 'slack';
  private readonly logger = new Logger('AlertSlack');

  constructor(
    private readonly webhookUrl: string,
    private readonly channel?: string,
  ) {}

  async send(alert: AlertPayload): Promise<void> {
    const emoji = SEVERITY_EMOJI[alert.severity] ?? ':bell:';
    const fields: Array<{ type: string; text: string }> = [];

    if (alert.metric) {
      fields.push({ type: 'mrkdwn', text: `*Metric:* ${alert.metric}` });
    }
    if (alert.value !== undefined) {
      fields.push({ type: 'mrkdwn', text: `*Value:* ${alert.value}` });
    }
    if (alert.threshold !== undefined) {
      fields.push({ type: 'mrkdwn', text: `*Threshold:* ${alert.threshold}` });
    }
    if (alert.service) {
      fields.push({ type: 'mrkdwn', text: `*Service:* ${alert.service}` });
    }

    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} ${alert.title}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: alert.message },
      },
    ];

    if (fields.length > 0) {
      blocks.push({
        type: 'section',
        fields,
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Severity: *${alert.severity}* | ${alert.timestamp.toISOString()}`,
        },
      ],
    });

    const body: Record<string, unknown> = { blocks };
    if (this.channel) body.channel = this.channel;

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        this.logger.warn(`Slack webhook returned ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`Slack delivery failed: ${(error as Error).message}`);
    }
  }
}
