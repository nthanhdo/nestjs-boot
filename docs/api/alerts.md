# Alerts API Reference

> Rule-based metric alerting with pluggable delivery channels (Slack, Discord, PagerDuty, webhook, console).

## Module Registration

```ts
AlertModule.register(options: AlertOptions): DynamicModule
```

`AlertModule` is `global: true` — register once in your root `AppModule`.

```ts
import { AlertModule } from '@nestjs-boot/alerts';

AlertModule.register({
  enabled: true,
  checkInterval: 30_000,
  cooldown: 300_000,
  rules: [
    {
      name: 'high-error-rate',
      metric: 'http_requests_total',
      condition: 'gt',
      threshold: 500,
      severity: 'critical',
      for: 60, // must persist for 60s before firing
    },
  ],
  channels: {
    slack: { webhookUrl: 'https://hooks.slack.com/...', channel: '#alerts' },
    pagerduty: { routingKey: 'ROUTING_KEY', severity: 'critical' },
    console: { enabled: true },
  },
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable or disable the alert service entirely |
| `checkInterval` | `number` | `30000` | How often (ms) to evaluate alert rules against Prometheus metrics |
| `cooldown` | `number` | `300000` | Minimum time (ms) between consecutive firings of the same rule |
| `rules` | `AlertRule[]` | `[]` | Alert rules to evaluate on each check interval |
| `channels.console` | `{ enabled?: boolean }` | — | Log alerts to NestJS Logger (auto-enabled when any channels are set) |
| `channels.webhook` | `{ url: string; headers?: Record<string, string> }` | — | POST `AlertPayload` as JSON to a custom URL |
| `channels.slack` | `{ webhookUrl: string; channel?: string }` | — | Deliver Block Kit messages to a Slack webhook |
| `channels.discord` | `{ webhookUrl: string }` | — | Deliver embed messages to a Discord webhook |
| `channels.pagerduty` | `{ routingKey: string; severity?: string }` | — | Create PagerDuty v2 Events API incidents |

---

## Classes

### `AlertService`

> Core service — evaluates rules, routes payloads to channels, tracks cooldowns and debounce.

Exported from `AlertModule`. Inject with standard NestJS DI.

#### Methods

##### `registerChannel(channel: AlertChannel): void`

Register a custom delivery channel at runtime. Channels registered via `AlertModule.register()` options are auto-registered on `onModuleInit`.

##### `addRule(rule: AlertRule): void`

Add or replace an alert rule at runtime.

##### `removeRule(name: string): void`

Remove a rule (and any pending debounce state) by name.

##### `getActiveAlerts(): AlertPayload[]`

Returns a copy of the in-memory active alerts list (capped at 1,000 entries).

##### `checkRules(): Promise<void>`

Manually trigger a rule evaluation cycle. Called automatically on `checkInterval`. Requires `MetricsService` to be registered in the same module context.

##### `sendAlert(payload: AlertPayload, channelNames?: string[]): Promise<void>`

Fire an alert payload directly without going through rule evaluation. If `channelNames` is provided, only those channels receive the alert; otherwise all registered channels are targeted.

---

### `ConsoleChannel`

> Logs alerts to NestJS Logger. Severity maps to `logger.error` / `logger.warn` / `logger.log`.

```ts
new ConsoleChannel()
```

Channel name: `'console'`

---

### `WebhookChannel`

> POSTs the full `AlertPayload` as JSON to a configurable URL.

```ts
new WebhookChannel(url: string, headers?: Record<string, string>)
```

Channel name: `'webhook'`

---

### `SlackChannel`

> Delivers a formatted Block Kit message to a Slack Incoming Webhook.

```ts
new SlackChannel(webhookUrl: string, channel?: string)
```

Channel name: `'slack'`

---

### `DiscordChannel`

> Delivers a color-coded embed to a Discord webhook. Colors: blue (info), orange (warning), red (critical).

```ts
new DiscordChannel(webhookUrl: string)
```

Channel name: `'discord'`

---

### `PagerDutyChannel`

> Creates a PagerDuty v2 Events API incident (`event_action: 'trigger'`). Uses `correlationId` as `dedup_key` when available.

```ts
new PagerDutyChannel(routingKey: string, defaultSeverity?: string)
```

Channel name: `'pagerduty'`

---

## Interfaces

### `AlertPayload`

```ts
interface AlertPayload {
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
```

### `AlertChannel`

```ts
interface AlertChannel {
  name: string;
  send(alert: AlertPayload): Promise<void>;
}
```

Implement this interface to create custom delivery channels.

### `AlertRule`

```ts
interface AlertRule {
  name: string;
  metric: string;           // Prometheus metric name
  condition: 'gt' | 'lt' | 'eq';
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  for?: number;             // debounce: seconds the condition must hold before firing
  channels?: string[];      // channel names to route to; all channels if omitted
}
```

### `AlertOptions`

```ts
interface AlertOptions {
  enabled?: boolean;
  checkInterval?: number;
  cooldown?: number;
  rules?: AlertRule[];
  channels?: AlertChannelConfig;
}

interface AlertChannelConfig {
  webhook?: { url: string; headers?: Record<string, string> };
  slack?: { webhookUrl: string; channel?: string };
  discord?: { webhookUrl: string };
  pagerduty?: { routingKey: string; severity?: string };
  console?: { enabled?: boolean };
}
```

---

## Constants / Tokens

| Token | Type | Description |
|-------|------|-------------|
| `ALERT_OPTIONS` | `Symbol` | Injection token for the `AlertOptions` config object |
| `DEFAULT_CHECK_INTERVAL` | `number` (`30000`) | Default rule evaluation interval in ms |
| `DEFAULT_COOLDOWN` | `number` (`300000`) | Default alert re-fire cooldown in ms |
