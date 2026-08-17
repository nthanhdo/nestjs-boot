# Tuần 10: Message Queue & Background Jobs

> **Stage 3 — Advanced | nestjs-boot Teaching Series**
> Yêu cầu: Đã học Tuần 9 (Microservices), biết Redis cơ bản

---

## Mục tiêu học tập

Sau bài này, sinh viên có thể:
- Giải thích tại sao cần async processing (và khi nào không cần)
- Mô tả kiến trúc BullMQ + Redis: producer, consumer, broker, job lifecycle
- Implement background jobs với `@Processor` / `@Process` decorators trong nestjs-boot
- Cấu hình retry strategy và Dead Letter Queue
- Hiểu idempotency và tại sao consumer phải xử lý duplicate messages
- Cài đặt Bull Board UI để monitor jobs

---

## 1. Tại sao cần Async Processing?

### 1.1 Analogy: Nhà hàng

```
KHÔNG có Queue (synchronous):

Khách gọi món
      │
Waiter đi vào bếp, đứng đợi chef nấu xong
      │  (5-10 phút)
Chef nấu xong
      │
Waiter mang ra bàn
      │
Waiter mới phục vụ khách tiếp theo

→ 1 waiter chỉ phục vụ được 6-12 khách/giờ
→ Khách phải chờ rất lâu
```

```
CÓ Queue (asynchronous):

Khách gọi món
      │
Waiter ghi order vào phiếu, đặt lên quầy order
      │ (30 giây)
"Order của bạn đang được chuẩn bị!"
      │
Waiter phục vụ khách tiếp theo ngay lập tức

Chef (background worker) lấy phiếu order từ quầy
      │ (5-10 phút, song song với việc waiter phục vụ khách khác)
Chef hoàn thành, đặt món lên quầy nhận
      │
Waiter mang ra bàn khi có thời gian

→ 1 waiter có thể phục vụ 60+ khách/giờ
```

**Bài học:** HTTP request = waiter. Background worker = chef. Queue = quầy order.

### 1.2 Use cases thực tế

| Task | Sync hay Async? | Lý do |
|------|----------------|-------|
| Login validate password | **Sync** | User cần kết quả ngay |
| Gửi email welcome | **Async** | User không cần chờ email |
| Generate PDF report | **Async** | Mất 30s, user không nên chờ |
| Resize ảnh sau upload | **Async** | Mất 2-5s, không blocking UX |
| Import 10,000 records từ CSV | **Async** | Mất vài phút |
| Gửi 1M push notification | **Async** | Không thể chờ |
| Tính real-time stock price | **Sync** | Phải fresh data |
| Ghi audit log | **Async** | Không cần chặn response |

### 1.3 Khi nào KHÔNG cần Queue?

- Task mất < 100ms → không đáng thêm complexity
- Cần kết quả ngay để return response
- System nhỏ, traffic thấp, team nhỏ → overhead không worth it

---

## 2. Kiến trúc Queue — Các khái niệm cốt lõi

### 2.1 Components

```
┌──────────────┐          ┌──────────────────┐          ┌──────────────┐
│   Producer   │          │   Broker (Redis)  │          │   Consumer   │
│              │          │                   │          │   (Worker)   │
│  addJob()    │──────>   │  Queue: "email"   │ ──────>  │  process()   │
│              │          │  ┌─────────────┐  │          │              │
│  (API server)│          │  │ Job 1: {to} │  │          │  (separate   │
│              │          │  │ Job 2: {to} │  │          │   process    │
└──────────────┘          │  │ Job 3: {to} │  │          │   or thread) │
                          │  └─────────────┘  │          └──────────────┘
                          └──────────────────┘
```

**Producer:** Code thêm jobs vào queue (thường là API handler)
**Broker:** Trung gian lưu trữ jobs (Redis trong trường hợp BullMQ)
**Consumer/Worker:** Code xử lý jobs (chạy trong background)
**Job:** Đơn vị công việc (có data, options, status)

### 2.2 Job Lifecycle

```
                ┌─────────────┐
   addJob()     │   WAITING   │   Job mới, chờ worker rảnh
      ──────>   └──────┬──────┘
                       │ Worker picks up
                ┌──────▼──────┐
                │   ACTIVE    │   Đang được xử lý bởi worker
                └──┬──────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
   ┌─────▼──────┐      ┌──────▼──────┐
   │ COMPLETED  │      │   FAILED    │
   │            │      │             │
   │ Job done!  │      │  retry? ────┤──> WAITING (retry)
   └────────────┘      │             │
                       │  max retry  │──> FAILED (permanent)
                       └─────────────┘         │
                                               ▼
                                        Dead Letter Queue
```

### 2.3 Dead Letter Queue (DLQ)

```
Job thất bại 3 lần → Không retry nữa
      │
      ▼
DLQ (Dead Letter Queue) — "bệnh viện" cho failed jobs

Ops team/admin có thể:
- Xem lý do thất bại
- Fix bug
- Re-queue job để xử lý lại
- Xóa job (nếu không cần nữa)
```

---

## 3. BullMQ — Thư viện Queue cho Node.js

### 3.1 Tại sao BullMQ?

- **Backed by Redis**: Redis cực nhanh, persistent, reliable
- **Priority queues**: job quan trọng hơn → xử lý trước
- **Delayed jobs**: add job bây giờ, xử lý sau 24 giờ
- **Repeatable jobs**: cron-like scheduling
- **Rate limiting**: max N jobs per minute
- **Built-in metrics**: job counts, processing time
- **Concurrency control**: N workers xử lý song song

### 3.2 Job States trong BullMQ

```
wait    → active → completed
                ↘ failed → (retry) → wait
                         → (max retry) → DLQ

delayed → wait  (sau khi hết thời gian delay)
paused  → wait  (khi queue được resume)
```

---

## 4. nestjs-boot QueueModule

### 4.1 Setup

File: `src/queue/queue.module.ts`, `src/queue/queue.service.ts`, `src/queue/decorators.ts`

```typescript
// app.module.ts
import { QueueModule } from 'nestjs-boot';

@Module({
  imports: [
    QueueModule.register({
      driver: 'bullmq',
      redis: { url: 'redis://localhost:6379' },
      defaultOptions: {
        attempts: 3,                        // retry 3 lần nếu fail
        backoff: {
          type: 'exponential',              // 1s, 2s, 4s, 8s...
          delay: 1000,
        },
        removeOnComplete: { count: 100 },   // giữ 100 completed jobs gần nhất
        removeOnFail: { count: 500 },       // giữ 500 failed jobs để debug
      },
    }),
  ],
})
export class AppModule {}
```

### 4.2 Producer — Thêm job vào queue

```typescript
// user.service.ts
import { Injectable } from '@nestjs/common';
import { QueueService } from 'nestjs-boot';

@Injectable()
export class UserService {
  constructor(private readonly queueService: QueueService) {}

  async registerUser(email: string, name: string): Promise<void> {
    // Tạo user trong DB (sync — cần trả về user ID)
    const user = await this.userRepository.create({ email, name });

    // Gửi email welcome (async — không cần chờ)
    await this.queueService.addJob('email', 'send-welcome', {
      to: email,
      name: name,
      userId: user.id,
    });

    // Tạo notification (async)
    await this.queueService.addJob('notification', 'push-notification', {
      userId: user.id,
      message: 'Welcome to our platform!',
    });

    // Ghi audit log (async, delay 0)
    await this.queueService.addJob('audit', 'log-registration', {
      userId: user.id,
      action: 'REGISTER',
      timestamp: new Date(),
    });
  }

  async exportUserReport(adminId: string): Promise<string> {
    const job = await this.queueService.addJob('reports', 'generate-pdf', {
      adminId,
      type: 'user-list',
      timestamp: new Date(),
    });
    // Trả về job ID để client poll status
    return (job as any).id;
  }

  async scheduleReminder(userId: string, hoursDelay: number): Promise<void> {
    await this.queueService.addJob(
      'email',
      'send-reminder',
      { userId },
      {
        delay: hoursDelay * 60 * 60 * 1000, // convert hours to ms
      },
    );
  }
}
```

### 4.3 Consumer — Xử lý jobs

nestjs-boot sử dụng **auto-discovery pattern** với DiscoveryService để tự động tìm và wire các `@Processor` class.

File: `src/queue/decorators.ts`

```typescript
import { Processor, Process, OnFailed, OnCompleted } from 'nestjs-boot';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
@Processor('email')     // Queue name phải khớp với producer
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  // Xử lý job có name 'send-welcome'
  @Process('send-welcome')
  async handleWelcomeEmail(job: any): Promise<void> {
    const { to, name, userId } = job.data;
    this.logger.log(`Sending welcome email to ${to}`, { jobId: job.id });

    // Giả lập gửi email
    await this.emailService.send({
      to,
      subject: 'Welcome!',
      template: 'welcome',
      context: { name },
    });

    this.logger.log(`Welcome email sent to ${to}`, { jobId: job.id });
    // Nếu không throw → job được mark COMPLETED
  }

  // Xử lý TẤT CẢ job trong queue này (không chỉ 'send-welcome')
  @Process()  // không truyền tên → xử lý mọi job name
  async handleAnyEmail(job: any): Promise<void> {
    this.logger.log(`Processing email job: ${job.name}`, { jobId: job.id });
    // ...
  }

  // Callback khi job FAIL sau tất cả retry
  @OnFailed()
  async handleFailed(job: any, error: Error): Promise<void> {
    this.logger.error(
      `Email job ${job.id} failed permanently: ${error.message}`,
      { jobId: job.id, jobName: job.name, data: job.data }
    );
    // Gửi alert cho admin, ghi DLQ custom, etc.
    await this.alertService.notify('EMAIL_JOB_FAILED', { jobId: job.id, error: error.message });
  }

  // Callback khi job COMPLETED
  @OnCompleted()
  async handleCompleted(job: any, result: unknown): Promise<void> {
    this.logger.log(`Email job ${job.id} completed`, { result });
    // Cập nhật trạng thái trong DB, gửi webhook, etc.
  }
}
```

**Đăng ký Processor vào module:**
```typescript
// email.module.ts
@Module({
  providers: [EmailProcessor, EmailService],
})
export class EmailModule {}
```

### 4.4 Auto-Discovery Pattern

nestjs-boot sử dụng `DiscoveryService` từ `@nestjs/core` để tự động tìm tất cả classes có decorator `@Processor` và wire chúng vào BullMQ workers khi module khởi động:

```typescript
// QueueModule.onModuleInit() — simplified
onModuleInit() {
  // Scan toàn bộ module tree để tìm @Processor classes
  const providers = this.discoveryService.getProviders();

  for (const wrapper of providers) {
    const queueName = this.reflector.get(PROCESSOR_METADATA, wrapper.metatype);
    if (!queueName) continue;  // Không phải @Processor, skip

    // Tìm tất cả methods có @Process decorator
    const methods = this.metadataScanner.scanFromPrototype(
      wrapper.instance,
      Object.getPrototypeOf(wrapper.instance),
      (method) => method,
    );

    for (const method of methods) {
      const jobName = this.reflector.get(PROCESS_METADATA, wrapper.instance[method]);
      if (!jobName) continue;

      // Wire method vào BullMQ worker
      this.queueService.registerWorker(queueName, async (job) => {
        return wrapper.instance[method](job);
      });
    }
  }
}
```

**Ưu điểm của auto-discovery:** Không cần manually register từng processor — chỉ thêm `@Processor` decorator và NestJS tự tìm ra.

---

## 5. Advanced Job Patterns

### 5.1 Delayed Jobs (Job hoãn thực hiện)

```typescript
// Gửi reminder sau 24 giờ
await this.queueService.addJob(
  'email',
  'send-reminder',
  { userId: '123', type: 'trial-ending' },
  {
    delay: 24 * 60 * 60 * 1000, // 24 giờ tính bằng ms
  },
);

// Gửi "Bạn còn hàng trong giỏ hàng" sau 1 giờ
await this.queueService.addJob(
  'email',
  'cart-abandonment',
  { userId: '123', cartId: 'cart-456' },
  {
    delay: 60 * 60 * 1000,  // 1 giờ
    jobId: `cart-${cartId}`, // Custom ID để có thể cancel sau này
  },
);
```

### 5.2 Repeatable Jobs (Cron-like)

```typescript
// Gửi daily report lúc 9:00 sáng mỗi ngày
await this.queueService.addJob(
  'reports',
  'daily-summary',
  { type: 'sales' },
  {
    repeat: { cron: '0 9 * * *' },  // 9:00 AM mỗi ngày
  },
);

// Cleanup expired sessions mỗi giờ
await this.queueService.addJob(
  'maintenance',
  'cleanup-sessions',
  {},
  {
    repeat: { every: 60 * 60 * 1000 }, // mỗi 60 phút
  },
);
```

### 5.3 Priority Queues

```typescript
// Priority cao hơn → xử lý trước
// BullMQ: priority càng thấp số → priority càng cao

await this.queueService.addJob('email', 'send-otp', data, {
  priority: 1,  // HIGHEST — gửi OTP phải nhanh
});

await this.queueService.addJob('email', 'send-newsletter', data, {
  priority: 10, // LOW — newsletter có thể chờ
});
```

### 5.4 Rate-Limited Jobs

```typescript
// Max 10 requests/minute tới external SMS API
// BullMQ không có built-in rate limit per-job,
// nhưng ta có thể limit ở Worker level

@Processor('sms')
export class SmsProcessor {
  private rateLimiter = new RateLimiter({ max: 10, windowMs: 60000 });

  @Process('send-sms')
  async sendSms(job: any): Promise<void> {
    // Chờ nếu đang rate limited
    await this.rateLimiter.acquire();

    await this.smsProvider.send(job.data);
  }
}
```

### 5.5 Bulk Jobs

```typescript
// Thêm nhiều jobs cùng lúc (hiệu quả hơn addJob nhiều lần)
await this.queueService.addBulk('email', [
  { name: 'send-welcome', data: { to: 'user1@example.com' } },
  { name: 'send-welcome', data: { to: 'user2@example.com' } },
  { name: 'send-welcome', data: { to: 'user3@example.com' } },
]);
```

---

## 6. Retry Strategies

### 6.1 Fixed Retry

```typescript
QueueModule.register({
  defaultOptions: {
    attempts: 5,          // Retry 5 lần
    backoff: {
      type: 'fixed',
      delay: 5000,        // Chờ 5 giây trước mỗi retry
    },
  },
});

// Timeline: Fail → 5s → Fail → 5s → Fail → 5s → ...
```

### 6.2 Exponential Backoff (recommended)

```typescript
QueueModule.register({
  defaultOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,        // Base delay: 1 giây
    },
  },
});

// Timeline: Fail → 1s → Fail → 2s → Fail → 4s → Fail → 8s → Fail → DEAD
// Công thức: delay * 2^(attemptNumber - 1)
```

**Tại sao Exponential Backoff?**
- Nếu service bị overload → spam retry sẽ làm tệ hơn
- Exponential backoff cho service thời gian phục hồi
- Theo xác suất, các clients sẽ không đồng thời retry

### 6.3 Custom Retry Logic

```typescript
@Process('send-email')
async handleEmail(job: any): Promise<void> {
  try {
    await this.emailService.send(job.data);
  } catch (error) {
    // Không retry nếu địa chỉ email không hợp lệ (permanent error)
    if (error.code === 'INVALID_EMAIL') {
      this.logger.warn(`Invalid email, not retrying: ${job.data.to}`);
      return; // Trả về bình thường → job COMPLETED (không retry)
    }

    // Các lỗi khác (network, timeout) → throw để BullMQ retry
    throw error;
  }
}
```

---

## 7. Idempotency — Quan trọng!

### 7.1 Vấn đề At-Least-Once Delivery

```
Producer gửi email job
      │
BullMQ deliver job tới Worker
      │
Worker xử lý 50% (đang gửi email)...
      │
Worker CRASH ← server restart, OOM, network cut
      │
BullMQ: "Job chưa được COMPLETED → retry!"
      │
Worker mới nhận job, gửi email LẦN 2
      │
User nhận 2 email 😱
```

**Đây là "at-least-once delivery"**: job được deliver ít nhất 1 lần, nhưng có thể nhiều hơn.

### 7.2 Giải pháp: Idempotent Consumers

**Idempotent = thực hiện nhiều lần nhưng kết quả như thực hiện 1 lần.**

```typescript
@Process('send-welcome')
async handleWelcomeEmail(job: any): Promise<void> {
  const { userId, to } = job.data;

  // Kiểm tra đã gửi email này chưa (idempotency check)
  const alreadySent = await this.emailLogRepository.exists({
    userId,
    type: 'welcome',
  });

  if (alreadySent) {
    this.logger.log(`Welcome email already sent to ${userId}, skipping`);
    return; // Job completed, nhưng không gửi email lần nữa
  }

  // Gửi email
  await this.emailService.send({ to, template: 'welcome' });

  // Ghi lại đã gửi rồi
  await this.emailLogRepository.create({
    userId,
    type: 'welcome',
    sentAt: new Date(),
  });
}
```

**Alternative: Dùng job ID làm idempotency key:**
```typescript
@Process('send-invoice')
async handleInvoice(job: any): Promise<void> {
  const idempotencyKey = `invoice-${job.id}`;

  // Check trong Redis/DB xem key này đã được process chưa
  const processed = await this.redis.get(idempotencyKey);
  if (processed) return;

  await this.invoiceService.generate(job.data);

  // Set key với TTL (để tránh redis bị đầy)
  await this.redis.set(idempotencyKey, '1', 'EX', 60 * 60 * 24); // 24h TTL
}
```

---

## 8. Backpressure — Khi Producer nhanh hơn Consumer

### 8.1 Vấn đề

```
Producer: 1000 jobs/giây
Consumer: 100 jobs/giây
Redis Queue: 900 jobs/giây tích tụ → Queue ngày càng to → Redis OOM!
```

### 8.2 Giải pháp

**1. Concurrency limit** — chạy N workers song song:

```typescript
// QueueService.registerWorker() — simplified
const worker = new Worker(queueName, processor, {
  connection: this.connection,
  concurrency: 5,   // Xử lý tối đa 5 jobs cùng lúc
});
```

**2. Rate limit producer:**
```typescript
// Không add quá 100 jobs/giây
const limiter = new Bottleneck({ maxConcurrent: 100, minTime: 10 });
await limiter.schedule(() => this.queueService.addJob(...));
```

**3. Pause queue khi quá tải:**
```typescript
// Monitor queue size
const queue = this.queueService.getQueue('email');
const jobCount = await (queue as any).getJobCounts();

if (jobCount.waiting > 10000) {
  this.logger.warn('Queue overloaded, pausing producer');
  // Gửi signal cho producers biết cần chậm lại
}
```

---

## 9. Bull Board — Monitor Queue bằng UI

### 9.1 Setup

```bash
npm install @bull-board/api @bull-board/express
```

```typescript
// main.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue } = createBullBoard({
  queues: [],
  serverAdapter,
});

// Sau khi app khởi động
const emailQueue = app.get(QueueService).getQueue('email');
addQueue(new BullMQAdapter(emailQueue as any));

app.use('/admin/queues', serverAdapter.getRouter());
```

Mở http://localhost:3000/admin/queues → Thấy:
- Số jobs đang waiting/active/completed/failed
- Chi tiết từng job (data, error, stack trace)
- Retry job thủ công
- Clear queue

---

## 10. Hands-on: Email Job System

### Bước 1: Setup

```bash
# Chạy Redis
docker run -d -p 6379:6379 redis:alpine

# Install dependencies
npm install bullmq ioredis
```

### Bước 2: Tạo Email Processor

```typescript
// email.processor.ts
import { Injectable, Logger } from '@nestjs/common';
import { Processor, Process, OnFailed } from 'nestjs-boot';

@Injectable()
@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  @Process('send-welcome')
  async handleWelcome(job: any): Promise<{ sent: boolean }> {
    this.logger.log(`[Job ${job.id}] Sending welcome email to ${job.data.to}`);

    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate 20% failure rate (để test retry)
    if (Math.random() < 0.2) {
      throw new Error('SMTP connection timeout');
    }

    this.logger.log(`[Job ${job.id}] Welcome email sent!`);
    return { sent: true };
  }

  @OnFailed()
  async handleFailed(job: any, error: Error): Promise<void> {
    this.logger.error(
      `[Job ${job.id}] Failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }
}
```

### Bước 3: Test các scenarios

```typescript
// test/queue.e2e-spec.ts

it('should send welcome email', async () => {
  await queueService.addJob('email', 'send-welcome', {
    to: 'test@example.com',
    name: 'Test User',
  });

  // Chờ job được xử lý
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Kiểm tra email đã được gửi
  expect(emailService.sendCalled).toBe(true);
});

it('should retry on failure', async () => {
  // Force fail 2 lần, thành công lần 3
  emailService.failCount = 2;

  await queueService.addJob('email', 'send-welcome', { to: 'test@example.com' });

  await new Promise(resolve => setTimeout(resolve, 10000)); // Chờ retry

  expect(emailService.attemptCount).toBe(3);
  expect(emailService.sendSucceeded).toBe(true);
});
```

---

## 11. Bài tập thực hành

### Exercise 1: Delayed Reminder System

Implement hệ thống gửi nhắc nhở theo schedule:

1. API `POST /reminders` nhận `{ userId, message, sendAfterHours }`
2. Tạo delayed job với delay tương ứng
3. Worker gửi email/notification khi đến giờ
4. API `DELETE /reminders/:jobId` để cancel reminder (cancel BullMQ job theo ID)

**Gợi ý:**
```typescript
// Add job với custom ID để có thể cancel
const job = await this.queueService.addJob(
  'reminders',
  'send-reminder',
  data,
  {
    delay: hours * 3600000,
    jobId: `reminder-${userId}-${timestamp}`,  // Custom ID
  }
);

// Cancel job
const queue = this.queueService.getQueue('reminders');
const job = await (queue as any).getJob(jobId);
if (job) await job.remove();
```

### Exercise 2: Priority Email Queue

Implement queue với 3 mức priority:
- **P1 (OTP)**: Phải gửi trong < 30 giây
- **P2 (Transactional)**: Gửi trong < 5 phút
- **P3 (Marketing)**: Gửi trong < 1 giờ, có thể hoãn

### Exercise 3: DLQ Monitoring

1. Setup Dead Letter Queue handler
2. Khi job fail vĩnh viễn → lưu vào MongoDB collection `failed_jobs`
3. Tạo API `GET /admin/failed-jobs` để xem danh sách
4. Tạo API `POST /admin/failed-jobs/:id/retry` để retry thủ công

### Homework

Nghiên cứu và trả lời:
1. **Exactly-once delivery** có thực sự đạt được không? Tại sao Kafka/RabbitMQ vẫn là at-least-once?
2. BullMQ dùng Lua scripts trong Redis để làm gì? Tại sao cần atomic operations?
3. So sánh BullMQ vs RabbitMQ vs Kafka — khi nào dùng cái nào?

---

## 12. Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `bullmq not installed` | Thiếu package | `npm install bullmq ioredis` |
| Job stuck ở ACTIVE mãi | Worker crash mà không được detect | BullMQ tự động cleanup job cũ hơn `lockDuration`. Không cần xử lý |
| Queue không có worker | `@Processor` class không được provide trong module | Thêm vào `providers` array trong module |
| `maxRetriesPerRequest` error | ioredis config sai | Thêm `{ maxRetriesPerRequest: null }` vào ioredis options |
| Jobs xử lý nhiều lần | Consumer không idempotent | Implement idempotency key check |
| Redis OOM | Queue tích tụ quá nhiều jobs | Set `removeOnComplete`, `removeOnFail`, tăng concurrency |
| Worker process job quá chậm | Blocking I/O trong sync code | Dùng async/await đúng cách, tránh `sleep()` sync |

---

## 13. Self-check Questions

1. Giải thích **tại sao** cần BullMQ thay vì chỉ dùng `setTimeout` để delay jobs?
2. Khi Worker crash giữa chừng, job có bị mất không? Giải thích cơ chế.
3. Vẽ timeline của một job với retry `exponential backoff, delay: 1000ms, attempts: 4`.
4. Tại sao Consumer phải implement **idempotency**? Cho ví dụ khi thiếu idempotency gây hại gì.
5. Backpressure là gì? Hệ thống của bạn có 10,000 pending jobs, phải làm gì?

---

## 14. Đọc thêm

- [BullMQ Documentation](https://docs.bullmq.io/) — official docs
- [nestjs-boot source] `src/queue/` — QueueModule, QueueService, decorators
- [Redis Data Structures](https://redis.io/docs/data-types/) — hiểu cách BullMQ lưu jobs trong Redis
- [Distributed Systems — At-Least-Once Delivery](https://bravenewgeek.com/you-cannot-have-exactly-once-delivery/) — tại sao exactly-once rất khó
- [Exponential Backoff and Jitter (AWS)](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — tại sao cần jitter

---

*Tuần trước: [Tuần 9 — Microservices](./week-09-microservices.md)*
*Tuần tiếp theo: [Tuần 11 — Event-Driven Architecture & CQRS](./week-11-events-cqrs.md)*
