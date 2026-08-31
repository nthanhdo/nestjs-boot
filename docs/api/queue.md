# Queue API Reference

> BullMQ-backed job queue abstraction with decorator-driven processor registration and automatic worker lifecycle management.

## Module Registration

```ts
import { QueueModule } from 'nestjs-boot';

@Module({
  imports: [
    QueueModule.register({
      driver: 'bullmq',
      redis: { url: 'redis://localhost:6379' },
      defaultOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
  ],
})
export class AppModule {}
```

`QueueModule.register()` is **global** — `QueueService` is available in every module without re-importing.

### Named Queue Registration

Register a named queue to inject it directly by token:

```ts
QueueModule.registerQueue('email')
```

This creates the injection token `BOOT_QUEUE_email` that resolves the underlying BullMQ `Queue` instance.

---

## Classes

### `QueueModule`

`@Module` · `implements OnModuleInit`

Bootstraps the queue system and auto-discovers `@Processor` classes on `onModuleInit`.

#### Static Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(options: QueueOptions): DynamicModule` | Register the global queue system with Redis connection and default job options. |
| `registerQueue` | `(name: string, options?: Partial<QueueOptions>): DynamicModule` | Register a named queue and expose it under the `BOOT_QUEUE_{name}` token. |

---

### `QueueService`

`@Injectable()` · `implements OnModuleDestroy`

Manages BullMQ queue instances and provides job-adding methods. BullMQ is loaded dynamically — if not installed all methods throw with a helpful message.

#### Constructor

```ts
constructor(private readonly options: QueueOptions)
```

Initializes a shared ioredis connection from `options.redis.url`. If `bullmq` is not installed, logs a warning and does not throw until a method is called.

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getQueue` | `(name: string): BullQueue` | Get or create a BullMQ `Queue` by name. Caches the instance internally. |
| `addJob` | `(queueName: string, jobName: string, data: unknown, opts?: unknown): Promise<unknown>` | Add a single named job to a queue. |
| `addBulk` | `(queueName: string, jobs: { name: string; data: unknown; opts?: unknown }[]): Promise<unknown[]>` | Add multiple jobs to a queue in bulk. |
| `registerWorker` | `(queueName: string, processor: (job: unknown) => Promise<unknown>, handlers?: { onFailed?; onCompleted? }): void` | `@internal` — called by `QueueModule.onModuleInit()` to wire `@Processor` classes. |
| `onModuleDestroy` | `(): Promise<void>` | Gracefully closes all workers, queues, and the shared Redis connection. |

---

## Decorators

### `@Processor(queueName: string)`

**Class decorator.** Marks a class as a worker for the named queue. The class is discovered automatically via NestJS `DiscoveryService` on module init.

```ts
@Processor('email')
export class EmailProcessor {
  @Process('send-welcome')
  async handleWelcome(job: Job<{ to: string }>) {
    await sendEmail(job.data.to);
  }
}
```

---

### `@Process(jobName?: string)`

**Method decorator.** Marks a method as the job handler. If `jobName` is omitted or `'*'`, handles all jobs on the queue.

```ts
@Process('send-welcome')   // handles only jobs named 'send-welcome'
async handleWelcome(job) { ... }

@Process()                  // handles all jobs
async handleAll(job) { ... }
```

---

### `@OnFailed()`

**Method decorator.** Marks a method as the failed-job handler (DLQ pattern). Called when a job exceeds its retry attempts.

```ts
@OnFailed()
async handleFailed(job, error: Error) {
  console.error(`Job ${job.id} failed:`, error.message);
}
```

---

### `@OnCompleted()`

**Method decorator.** Marks a method as the completed-job handler.

```ts
@OnCompleted()
async handleCompleted(job, result: unknown) {
  console.log(`Job ${job.id} completed with result:`, result);
}
```

---

## Interfaces

### `QueueOptions`

```ts
interface QueueOptions {
  /** Queue driver — currently only 'bullmq' is supported */
  driver: 'bullmq';
  /** Redis connection */
  redis: { url: string };
  /** Default job options applied to all enqueued jobs */
  defaultOptions?: {
    attempts?: number;
    backoff?: { type: 'exponential' | 'fixed'; delay: number };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
}
```

---

## Constants / Tokens

| Constant | Value | Purpose |
|----------|-------|---------|
| `QUEUE_OPTIONS` | `'BOOT_QUEUE_OPTIONS'` | Injection token for the `QueueOptions` object. |
| `QUEUE_PREFIX` | `'BOOT_QUEUE_'` | Token prefix for named queues — e.g. `BOOT_QUEUE_email`. |
| `PROCESSOR_METADATA` | `'BOOT_PROCESSOR_QUEUE'` | Reflect metadata key set by `@Processor`. |
| `PROCESS_METADATA` | `'BOOT_PROCESS_JOB'` | Reflect metadata key set by `@Process`. |
| `ON_FAILED_METADATA` | `'BOOT_ON_FAILED'` | Reflect metadata key set by `@OnFailed`. |
| `ON_COMPLETED_METADATA` | `'BOOT_ON_COMPLETED'` | Reflect metadata key set by `@OnCompleted`. |

---

## Optional Dependencies

| Package | When required |
|---------|---------------|
| `bullmq` | Required at runtime for any queue operation. |
| `ioredis` | Required at runtime for the Redis connection. |

Install: `npm install bullmq ioredis`
