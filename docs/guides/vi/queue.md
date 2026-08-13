# Queue (BullMQ)

nestjs-boot cung cấp lớp trừu tượng queue dựa trên cấu hình, xây dựng trên BullMQ với processor khai báo bằng decorator, thao tác hàng loạt, và tự động dọn dẹp khi shutdown.

## Cài đặt

Cài đặt các peer dependency cần thiết:

```bash
npm install bullmq ioredis
```

Đăng ký QueueModule trong module gốc:

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

Để tạo queue có tên riêng, thêm `registerQueue()`:

```ts
QueueModule.registerQueue('email'),
QueueModule.registerQueue('notifications'),
```

## Thêm Job

Inject `QueueService` để đưa job vào queue:

```ts
import { QueueService } from 'nestjs-boot/queue';

@Injectable()
export class OrderService {
  constructor(private readonly queueService: QueueService) {}

  async placeOrder(order: Order) {
    await this.save(order);

    // Job đơn lẻ
    await this.queueService.addJob('email', 'order-confirmation', {
      to: order.email,
      orderId: order.id,
    });

    // Job hàng loạt
    await this.queueService.addBulk('notifications', [
      { name: 'sms', data: { phone: order.phone, text: 'Order placed' } },
      { name: 'push', data: { userId: order.userId, title: 'Order placed' } },
    ]);
  }
}
```

Tùy chọn từng job ghi đè giá trị mặc định:

```ts
await this.queueService.addJob('reports', 'generate-monthly', { month: 7 }, {
  attempts: 5,
  backoff: { type: 'fixed', delay: 5000 },
  removeOnComplete: false,
  delay: 60_000, // bắt đầu sau 60s
});
```

## Processor

Dùng decorator để định nghĩa handler cho job. `@Processor` đánh dấu lớp cho một queue, `@Process` đánh dấu phương thức xử lý:

```ts
import { Processor, Process, OnFailed, OnCompleted } from 'nestjs-boot/queue';

@Processor('email')
@Injectable()
export class EmailProcessor {
  @Process('order-confirmation')
  async handleOrderConfirmation(job: Job) {
    await this.mailer.send(job.data.to, 'Your order is confirmed');
  }

  @Process() // xử lý tất cả job name chưa được match ở trên
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

Đăng ký processor như provider trong module nơi queue được sử dụng.

## Truy cập Queue gốc

Để thực hiện thao tác nâng cao (pause, drain, đếm job), truy cập trực tiếp BullMQ Queue:

```ts
const queue = this.queueService.getQueue('email');
```

## Tham chiếu cấu hình

| Tùy chọn | Kiểu | Mặc định | Mô tả |
|--------|------|---------|-------------|
| `driver` | `'bullmq'` | bắt buộc | Backend queue (chỉ hỗ trợ BullMQ) |
| `redis.url` | `string` | bắt buộc | URL kết nối Redis |
| `defaultOptions.attempts` | `number` | `1` | Số lần thử tối đa |
| `defaultOptions.backoff.type` | `'exponential' \| 'fixed'` | - | Chiến lược backoff |
| `defaultOptions.backoff.delay` | `number` | - | Delay cơ sở tính bằng ms |
| `defaultOptions.removeOnComplete` | `boolean \| number` | `false` | Xóa job hoàn thành (hoặc giữ N job gần nhất) |
| `defaultOptions.removeOnFail` | `boolean \| number` | `false` | Xóa job thất bại (hoặc giữ N job gần nhất) |

## Thực hành tốt

- Đặt `removeOnComplete` là một số (ví dụ `100`) để giữ N job hoàn thành gần nhất phục vụ debug mà không để Redis tăng không giới hạn.
- Dùng exponential backoff cho lời gọi API bên ngoài (jitter mạng), fixed backoff cho thử lại nội bộ.
- Đặt tên cho job (`addJob('queue', 'job-name', data)`) để processor có thể định tuyến theo loại và dashboard hiển thị nhãn có ý nghĩa.
- BullMQ và ioredis là dependency tùy chọn. Nếu chưa cài, QueueService ghi cảnh báo và tất cả phương thức ném lỗi với thông báo rõ ràng.
- QueueService implement `OnModuleDestroy` và tự động đóng tất cả worker, queue, và kết nối Redis chia sẻ khi shutdown.
