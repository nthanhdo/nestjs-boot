import { Logger } from '@nestjs/common';
import { AlertChannel, AlertPayload } from '../interfaces';

const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';

const SEVERITY_MAP: Record<string, string> = {
  info: 'info',
  warning: 'warning',
  critical: 'critical',
};

export class PagerDutyChannel implements AlertChannel {
  readonly name = 'pagerduty';
  private readonly logger = new Logger('AlertPagerDuty');

  constructor(
    private readonly routingKey: string,
    private readonly defaultSeverity?: string,
  ) {}

  async send(alert: AlertPayload): Promise<void> {
    const payload = {
      routing_key: this.routingKey,
      event_action: 'trigger',
      dedup_key: alert.correlationId ?? `${alert.title}-${alert.metric ?? 'unknown'}`,
      payload: {
        summary: `${alert.title}: ${alert.message}`,
        source: alert.service ?? 'nestjs-boot',
        severity: this.defaultSeverity ?? SEVERITY_MAP[alert.severity] ?? 'warning',
        timestamp: alert.timestamp.toISOString(),
        custom_details: {
          metric: alert.metric,
          value: alert.value,
          threshold: alert.threshold,
        },
      },
    };

    try {
      const response = await fetch(PAGERDUTY_EVENTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.warn(`PagerDuty returned ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`PagerDuty delivery failed: ${(error as Error).message}`);
    }
  }
}
