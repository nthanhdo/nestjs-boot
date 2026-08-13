import { Logger } from '@nestjs/common';
import { AlertChannel, AlertPayload } from '../interfaces';

const SEVERITY_PREFIX: Record<string, string> = {
  info: 'INFO',
  warning: 'WARN',
  critical: 'CRIT',
};

export class ConsoleChannel implements AlertChannel {
  readonly name = 'console';
  private readonly logger = new Logger('AlertConsole');

  async send(alert: AlertPayload): Promise<void> {
    const prefix = SEVERITY_PREFIX[alert.severity] ?? alert.severity.toUpperCase();
    const parts = [`[${prefix}] ${alert.title}: ${alert.message}`];
    if (alert.metric) parts.push(`metric=${alert.metric}`);
    if (alert.value !== undefined) parts.push(`value=${alert.value}`);
    if (alert.threshold !== undefined) parts.push(`threshold=${alert.threshold}`);

    const line = parts.join(' | ');

    if (alert.severity === 'critical') {
      this.logger.error(line);
    } else if (alert.severity === 'warning') {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}
