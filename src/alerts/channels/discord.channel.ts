import { Logger } from '@nestjs/common';
import { AlertChannel, AlertPayload } from '../interfaces';

const SEVERITY_COLOR: Record<string, number> = {
  info: 0x3498db,    // blue
  warning: 0xf39c12, // orange
  critical: 0xe74c3c, // red
};

export class DiscordChannel implements AlertChannel {
  readonly name = 'discord';
  private readonly logger = new Logger('AlertDiscord');

  constructor(private readonly webhookUrl: string) {}

  async send(alert: AlertPayload): Promise<void> {
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];

    if (alert.metric) {
      fields.push({ name: 'Metric', value: alert.metric, inline: true });
    }
    if (alert.value !== undefined) {
      fields.push({ name: 'Value', value: String(alert.value), inline: true });
    }
    if (alert.threshold !== undefined) {
      fields.push({ name: 'Threshold', value: String(alert.threshold), inline: true });
    }
    if (alert.service) {
      fields.push({ name: 'Service', value: alert.service, inline: true });
    }

    const embed = {
      title: alert.title,
      description: alert.message,
      color: SEVERITY_COLOR[alert.severity] ?? SEVERITY_COLOR.info,
      fields,
      footer: { text: `Severity: ${alert.severity}` },
      timestamp: alert.timestamp.toISOString(),
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (!response.ok) {
        this.logger.warn(`Discord webhook returned ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`Discord delivery failed: ${(error as Error).message}`);
    }
  }
}
