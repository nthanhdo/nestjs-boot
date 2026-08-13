# Cảnh báo (Alerts)

> **TL;DR** — `AlertModule` giám sát các metric Prometheus và gửi thông báo qua các kênh có thể cắm thêm (Console, Webhook, Slack, Discord, PagerDuty). Định nghĩa rule với ngưỡng, điều kiện và mức độ nghiêm trọng. Cơ chế cooldown và debounce tích hợp sẵn ngăn chặn bão cảnh báo.

## Cài đặt

Đăng ký `AlertModule` trong module gốc qua `BootModule` options hoặc trực tiếp:

```ts
import { AlertModule } from 'nestjs-boot/alerts';

@Module({
  imports: [
    AlertModule.register({
      enabled: true,
      checkInterval: 30_000,   // kiểm tra metric mỗi 30s
      cooldown: 300_000,       // cooldown 5 phút mỗi rule
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
          for: 60,              // phải vượt ngưỡng 60s trước khi kích hoạt
          channels: ['slack'],  // gửi đến kênh cụ thể
        },
      ],
    }),
  ],
})
export class AppModule {}
```

Module đăng ký toàn cục. `MetricsService` từ module observability được inject tự động khi có sẵn — nếu không có, việc kiểm tra rule định kỳ bị vô hiệu hóa (bạn vẫn có thể gọi `sendAlert()` thủ công).

## API AlertService

Inject `AlertService` ở bất kỳ đâu:

```ts
import { AlertService } from 'nestjs-boot/alerts';

@Injectable()
export class MyService {
  constructor(private readonly alerts: AlertService) {}
}
```

### Các phương thức

| Phương thức | Chữ ký | Mô tả |
|-------------|--------|-------|
| `registerChannel` | `(channel: AlertChannel) => void` | Thêm kênh thông báo lúc runtime |
| `addRule` | `(rule: AlertRule) => void` | Thêm hoặc thay thế alert rule |
| `removeRule` | `(name: string) => void` | Xóa rule theo tên |
| `checkRules` | `() => Promise<void>` | Kích hoạt đánh giá rule thủ công dựa trên metric hiện tại |
| `sendAlert` | `(payload: AlertPayload, channelNames?: string[]) => Promise<void>` | Gửi cảnh báo trực tiếp (bỏ qua đánh giá rule) |
| `getActiveAlerts` | `() => AlertPayload[]` | Lấy danh sách cảnh báo đã kích hoạt gần đây (tối đa 1000) |

## Các kênh tích hợp sẵn

### Console

Ghi log cảnh báo qua NestJS Logger. Mặc định bật trừ khi tắt rõ ràng.

```ts
channels: {
  console: { enabled: true }  // mặc định — bỏ qua để giữ bật
}
```

### Webhook

Gửi `AlertPayload` dạng JSON đến bất kỳ HTTP endpoint nào.

```ts
channels: {
  webhook: {
    url: 'https://hooks.example.com/alerts',
    headers: { 'Authorization': 'Bearer xxx' },
  }
}
```

### Slack

Gửi tin nhắn Block Kit đến kênh Slack qua incoming webhook.

```ts
channels: {
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: '#ops-alerts',  // tùy chọn — ghi đè mặc định webhook
  }
}
```

### Discord

Gửi embed message đến Discord webhook. Mã màu theo mức độ: xanh dương (info), cam (warning), đỏ (critical).

```ts
channels: {
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  }
}
```

### PagerDuty

Gửi sự kiện đến PagerDuty Events API v2.

```ts
channels: {
  pagerduty: {
    routingKey: process.env.PAGERDUTY_ROUTING_KEY,
    severity: 'critical',  // ghi đè tùy chọn
  }
}
```

Sử dụng `alert.correlationId` hoặc `{title}-{metric}` làm `dedup_key` để ngăn incident trùng lặp.

## Alert Rules

Rules định nghĩa điều kiện kích hoạt cảnh báo khi metric vượt ngưỡng.

### Interface AlertRule

```ts
interface AlertRule {
  name: string;                              // định danh duy nhất
  metric: string;                            // tên metric Prometheus
  condition: 'gt' | 'lt' | 'eq';            // toán tử so sánh
  threshold: number;                         // giá trị ngưỡng
  severity: 'info' | 'warning' | 'critical';
  for?: number;                              // thời gian debounce tính bằng giây
  channels?: string[];                       // kênh đích (tất cả nếu bỏ qua)
}
```

### Toán tử điều kiện

| Điều kiện | Kích hoạt khi |
|-----------|---------------|
| `gt` | giá trị metric > ngưỡng |
| `lt` | giá trị metric < ngưỡng |
| `eq` | giá trị metric === ngưỡng |

### Rules động

Thêm hoặc xóa rules lúc runtime:

```ts
alertService.addRule({
  name: 'low-memory',
  metric: 'process_resident_memory_bytes',
  condition: 'gt',
  threshold: 512 * 1024 * 1024,
  severity: 'warning',
  for: 120,
});

alertService.removeRule('low-memory');
```

## Chống trùng lặp và Cooldown

Hai cơ chế ngăn chặn bão cảnh báo:

1. **Debounce (`for`)** — Khi rule có giá trị `for` (tính bằng giây), điều kiện phải đúng liên tục trong khoảng thời gian đó trước khi cảnh báo kích hoạt. Nếu điều kiện hết trước debounce, cảnh báo chờ sẽ reset.

2. **Cooldown** — Sau khi cảnh báo kích hoạt, cùng rule không thể kích hoạt lại cho đến khi hết cooldown. Mặc định: 300.000ms (5 phút). Cấu hình qua tùy chọn `cooldown`.

## Kênh tùy chỉnh

Implement interface `AlertChannel`:

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

// Đăng ký lúc runtime
alertService.registerChannel(new TelegramChannel(process.env.TG_TOKEN, process.env.TG_CHAT));
```

## Tích hợp với MetricsService

`AlertService` đọc metric từ `MetricsService.getRegistry()` trong mỗi chu kỳ kiểm tra. Nó gọi `registry.getMetricsAsJSON()`, tổng hợp tất cả tổ hợp label theo tên metric, và đánh giá rule dựa trên tổng.

Bất kỳ metric Prometheus nào đăng ký với `prom-client` (counter, gauge, histogram) đều có thể dùng làm nguồn cảnh báo — bao gồm cả metric nghiệp vụ tùy chỉnh.

## Ví dụ: Tỷ lệ lỗi cao gửi Slack

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
      for: 30,
      channels: ['slack'],
    },
  ],
}),
```

Khi `http_request_errors_total` vượt 50 trong 30 giây liên tục, tin nhắn Slack kích hoạt với chi tiết metric. Cùng cảnh báo sẽ không kích hoạt lại trong 5 phút (cooldown mặc định).

## Tham chiếu cấu hình

### AlertOptions

| Tùy chọn | Kiểu | Mặc định | Mô tả |
|----------|------|----------|-------|
| `enabled` | `boolean` | `true` | Bật/tắt kiểm tra rule định kỳ |
| `checkInterval` | `number` | `30000` | Chu kỳ kiểm tra tính bằng ms |
| `cooldown` | `number` | `300000` | Cooldown trước khi kích hoạt lại cùng rule (ms) |
| `rules` | `AlertRule[]` | `[]` | Các alert rule ban đầu |
| `channels` | `AlertChannelConfig` | — | Cấu hình kênh (xem bên dưới) |

### AlertChannelConfig

| Kênh | Trường bắt buộc | Trường tùy chọn |
|------|-----------------|-----------------|
| `console` | — | `enabled` (boolean) |
| `webhook` | `url` (string) | `headers` (Record) |
| `slack` | `webhookUrl` (string) | `channel` (string) |
| `discord` | `webhookUrl` (string) | — |
| `pagerduty` | `routingKey` (string) | `severity` (string) |

## Xem thêm

- [Observability](observability.md) — MetricsService và tích hợp Prometheus
- [Health & Shutdown](health-shutdown.md) — health check có thể kích hoạt cảnh báo
