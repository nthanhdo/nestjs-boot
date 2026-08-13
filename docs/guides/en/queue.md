# Queue (BullMQ)

> **TL;DR** — Register `QueueModule` with a Redis URL, create named queues with `registerQueue()`, enqueue jobs with `QueueService.addJob()`, and process them with `@Processor`/`@Process` decorators. Supports bulk operations, retry with backoff, and automatic cleanup on shutdown.

nestjs-boot provides a config-driven queue abstraction over BullMQ with decorator-based processors, bulk operations, and automatic cleanup on shutdown.

## Setup

Install the required peer dependencies:

```bash
npm install bullmq ioredis
```

Register QueueModule in your root module:

```ts
import { QueueModule } from 'nestjs-boot/queue';

@Module({
  imports: [
    QueueModule.register({
      driver: 'bullmq',
      redis: { url: 'redis://localhost:6379' },
      defaultOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
      },
    }),
  ],
})
export class AppModule {}
```

To create a dedicated named queue, add `registerQueue()` alongside:

```ts
QueueModule.registerQueue('email'),
QueueModule.registerQueue('notifications'),
```

## Adding Jobs

Inject `QueueService` to enqueue jobs:

```ts
import { QueueService } from 'nestjs-boot/queue';

@Injectable()
export class OrderService {
  constructor(private readonly queueService: QueueService) {}

  async placeOrder(order: Order) {
    await this.save(order);

    // Single job
    await this.queueService.addJob('email', 'order-confirmation', {
      to: order.email,
      orderId: order.id,
    });

    // Bulk jobs
    await this.queueService.addBulk('notifications', [
      { name: 'sms', data: { phone: order.phone, text: 'Order placed' } },
      { name: 'push', data: { userId: order.userId, title: 'Order placed' } },
    ]);
  }
}
```

Per-job options override the defaults:

```ts
await this.queueService.addJob('reports', 'generate-monthly', { month: 7 }, {
  attempts: 5,
  backoff: { type: 'fixed', delay: 5000 },
  removeOnComplete: false,
  delay: 60_000, // start after 60s
});
```

## Processors

Use decorators to define job handlers. `@Processor` marks a class for a queue, `@Process` marks the handler method:

```ts
import { Processor, Process, OnFailed, OnCompleted } from 'nestjs-boot/queue';

@Processor('email')
@Injectable()
export class EmailProcessor {
  @Process('order-confirmation')
  async handleOrderConfirmation(job: Job) {
    await this.mailer.send(job.data.to, 'Your order is confirmed');
  }

  @Process() // handles all job names not matched above
  async handleDefault(job: Job) {
    console.log('Unhandled email job:', job.name);
  }

  @OnFailed()
  handleFailed(job: Job, error: Error) {
    console.error(`Job ${job.id} failed:`, error.message);
  }

  @OnCompleted()
  handleCompleted(job: Job, result: unknown) {
    console.log(`Job ${job.id} completed with result:`, result);
  }
}
```

Register the processor as a provider in the module where the queue is used.

## Accessing the Raw Queue

For advanced operations (pause, drain, get job counts), access the underlying BullMQ Queue:

```ts
const queue = this.queueService.getQueue('email');
```

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `driver` | `'bullmq'` | required | Queue backend (only BullMQ supported) |
| `redis.url` | `string` | required | Redis connection URL |
| `defaultOptions.attempts` | `number` | `1` | Max job attempts |
| `defaultOptions.backoff.type` | `'exponential' \| 'fixed'` | - | Backoff strategy |
| `defaultOptions.backoff.delay` | `number` | - | Base delay in ms |
| `defaultOptions.removeOnComplete` | `boolean \| number` | `false` | Remove completed jobs (or keep last N) |
| `defaultOptions.removeOnFail` | `boolean \| number` | `false` | Remove failed jobs (or keep last N) |

## Best Practices

- Set `removeOnComplete` to a number (e.g. `100`) to keep the last N completed jobs for debugging without unbounded Redis growth.
- Use exponential backoff for external API calls (network jitter), fixed backoff for internal retries.
- Name your jobs (`addJob('queue', 'job-name', data)`) so processors can route by type and dashboards show meaningful labels.
- BullMQ and ioredis are optional dependencies. If not installed, QueueService logs a warning and all methods throw with a clear message.
- QueueService implements `OnModuleDestroy` and automatically closes all workers, queues, and the shared Redis connection on shutdown.

## See also

- [Event Bus](events.md) — for in-process pub/sub (no persistence); use queues when you need durable job processing
- [Observability](observability.md) — `QueueMetrics` for Prometheus queue depth and job duration metrics
- [Resilience](resilience.md) — retry and circuit breaker patterns for external API calls within processors
