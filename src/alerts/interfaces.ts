/**
 * Alert notification system interfaces.
 */

export interface AlertPayload {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
  timestamp: Date;
  service?: string;
  correlationId?: string;
}

export interface AlertChannel {
  name: string;
  send(alert: AlertPayload): Promise<void>;
}

export interface AlertRule {
  name: string;
  /** Prometheus metric name */
  metric: string;
  condition: 'gt' | 'lt' | 'eq';
  threshold: number;
  severity: AlertPayload['severity'];
  /** Duration in seconds before firing (debounce) */
  for?: number;
  /** Specific channels to route to, or all if omitted */
  channels?: string[];
}

export interface AlertChannelConfig {
  webhook?: { url: string; headers?: Record<string, string> };
  slack?: { webhookUrl: string; channel?: string };
  discord?: { webhookUrl: string };
  pagerduty?: { routingKey: string; severity?: string };
  console?: { enabled?: boolean };
}

export interface AlertOptions {
  enabled?: boolean;
  /** Check interval in ms (default: 30000) */
  checkInterval?: number;
  /** Cooldown in ms before re-firing same alert (default: 300000) */
  cooldown?: number;
  rules?: AlertRule[];
  channels?: AlertChannelConfig;
}
