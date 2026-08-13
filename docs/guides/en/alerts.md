# Alerts

> **TL;DR** — `AlertModule` monitors Prometheus metrics and dispatches notifications through pluggable channels (Console, Webhook, Slack, Discord, PagerDuty). Define rules with thresholds, conditions, and severity levels. Built-in cooldown and debounce prevent alert storms.

## Setup

Register `AlertModule` in your root module via `BootModule` options or directly:

```ts
import { AlertModule } from 'nestjs-boot/alerts';

@Module({
  imports: [
    AlertModule.register({
      enabled: true,
      checkInterval: 30_000,   // poll metrics every 30s
      cooldown: 300_000,       // 5 min cooldown per rule
      channels: {
        console: { enabled: true },
        slack: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: '#alerts',
        },
      },
      rules: [
        {
          name: 'high-error-rate',
          metric: 'http_errors_total',
          condition: 'gt',
          threshold: 100,
          severity: 'critical',
          for: 60,              // must exceed for 60s before firing
          channels: ['slack'],  // route to specific channels
        },
      ],
    }),
  ],
})
export class AppModule {}
```

The module registers globally. `MetricsService` from the observability module is injected automatically when available — without it, periodic rule checking is disabled (you can still call `sendAlert()` manually).

## AlertService API

Inject `AlertService` anywhere:

```ts
import { AlertService } from 'nestjs-boot/alerts';

@Injectable()
export class MyService {
  constructor(private readonly alerts: AlertService) {}
}
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerChannel` | `(channel: AlertChannel) => void` | Add a notification channel at runtime |
| `addRule` | `(rule: AlertRule) => void` | Add or replace an alert rule |
| `removeRule` | `(name: string) => void` | Remove a rule by name |
| `checkRules` | `() => Promise<void>` | Manually trigger rule evaluation against current metrics |
| `sendAlert` | `(payload: AlertPayload, channelNames?: string[]) => Promise<void>` | Send an alert directly (bypasses rule evaluation) |
| `getActiveAlerts` | `() => AlertPayload[]` | Get the list of recently fired alerts (capped at 1000) |

## Built-in Channels

### Console

Logs alerts via NestJS Logger. Enabled by default unless explicitly disabled.

```ts
channels: {
  console: { enabled: true }  // default — omit to keep enabled
}
```

Output format: `[CRIT] high-error-rate: http_errors_total is 150 (threshold: gt 100) | metric=http_errors_total | value=150 | threshold=100`

### Webhook

Posts the `AlertPayload` as JSON to any HTTP endpoint.

```ts
channels: {
  webhook: {
    url: 'https://hooks.example.com/alerts',
    headers: { 'Authorization': 'Bearer xxx' },
  }
}
```

### Slack

Sends rich Block Kit messages to a Slack channel via incoming webhook.

```ts
channels: {
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: '#ops-alerts',  // optional — override webhook default
  }
}
```

Messages include a header with severity emoji, metric details as fields, and a context footer with timestamp.

### Discord

Sends embed messages to a Discord webhook.

```ts
channels: {
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  }
}
```

Embeds are color-coded: blue (info), orange (warning), red (critical).

### PagerDuty

Sends events to PagerDuty Events API v2.

```ts
channels: {
  pagerduty: {
    routingKey: process.env.PAGERDUTY_ROUTING_KEY,
    severity: 'critical',  // optional override
  }
}
```

Uses `alert.correlationId` or `{title}-{metric}` as `dedup_key` to prevent duplicate incidents.

## Alert Rules

Rules define conditions that trigger alerts when metrics cross thresholds.

### AlertRule Interface

```ts
interface AlertRule {
  name: string;                              // unique identifier
  metric: string;                            // Prometheus metric name
  condition: 'gt' | 'lt' | 'eq';            // comparison operator
  threshold: number;                         // threshold value
  severity: 'info' | 'warning' | 'critical';
  for?: number;                              // debounce duration in seconds
  channels?: string[];                       // target channels (all if omitted)
}
```

### Condition Operators

| Condition | Fires when |
|-----------|-----------|
| `gt` | metric value > threshold |
| `lt` | metric value < threshold |
| `eq` | metric value === threshold |

### Dynamic Rules

Add or remove rules at runtime:

```ts
alertService.addRule({
  name: 'low-memory',
  metric: 'process_resident_memory_bytes',
  condition: 'gt',
  threshold: 512 * 1024 * 1024, // 512 MB
  severity: 'warning',
  for: 120,
});

alertService.removeRule('low-memory');
```

## Deduplication and Cooldown

Two mechanisms prevent alert flooding:

1. **Debounce (`for`)** — When a rule has a `for` value (in seconds), the condition must remain true continuously for that duration before the alert fires. If the condition clears before the debounce period, the pending alert resets.

2. **Cooldown** — After an alert fires, the same rule cannot fire again until the cooldown period elapses. Default: 300,000ms (5 minutes). Configure via the `cooldown` option.

```
[condition true] ──(for: 60s)──> [still true?] ──> FIRE ──(cooldown: 5min)──> [eligible again]
                                       │
                                  [cleared] → reset
```

## Custom Channels

Implement the `AlertChannel` interface:

```ts
import { AlertChannel, AlertPayload } from 'nestjs-boot/alerts';

export class TelegramChannel implements AlertChannel {
  readonly name = 'telegram';

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  async send(alert: AlertPayload): Promise<void> {
    const text = `[${alert.severity.toUpperCase()}] ${alert.title}\n${alert.message}`;
    await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text }),
      },
    );
  }
}

// Register at runtime
alertService.registerChannel(new TelegramChannel(process.env.TG_TOKEN, process.env.TG_CHAT));
```

## Integration with MetricsService

`AlertService` reads metrics from `MetricsService.getRegistry()` during each check interval. It calls `registry.getMetricsAsJSON()`, sums all label combinations per metric name, and evaluates rules against the totals.

This means any Prometheus metric registered with `prom-client` (counters, gauges, histograms) is available as an alert source — including custom business metrics.

## Example: High Error Rate to Slack

```ts
AlertModule.register({
  channels: {
    slack: { webhookUrl: process.env.SLACK_WEBHOOK },
  },
  rules: [
    {
      name: 'api-error-spike',
      metric: 'http_request_errors_total',
      condition: 'gt',
      threshold: 50,
      severity: 'critical',
      for: 30,              // sustained for 30s
      channels: ['slack'],
    },
  ],
}),
```

When `http_request_errors_total` exceeds 50 for 30 consecutive seconds, a Slack message fires with metric details. The same alert won't fire again for 5 minutes (default cooldown).

## Configuration Reference

### AlertOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable periodic rule checking |
| `checkInterval` | `number` | `30000` | Polling interval in ms |
| `cooldown` | `number` | `300000` | Cooldown before re-firing same rule (ms) |
| `rules` | `AlertRule[]` | `[]` | Initial alert rules |
| `channels` | `AlertChannelConfig` | — | Channel configuration (see below) |

### AlertChannelConfig

| Channel | Required Fields | Optional Fields |
|---------|----------------|-----------------|
| `console` | — | `enabled` (boolean) |
| `webhook` | `url` (string) | `headers` (Record) |
| `slack` | `webhookUrl` (string) | `channel` (string) |
| `discord` | `webhookUrl` (string) | — |
| `pagerduty` | `routingKey` (string) | `severity` (string) |

## See Also

- [Observability](observability.md) — MetricsService and Prometheus integration
- [Health & Shutdown](health-shutdown.md) — health checks that can trigger alerts
