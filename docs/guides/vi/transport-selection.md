# Hướng dẫn lựa chọn Transport

> **Tóm tắt** — Bắt đầu với **gRPC**. Chuyển sang NATS khi cần pub/sub fan-out.
> Dùng RabbitMQ khi cần hàng đợi bền vững, được xác nhận. TCP chỉ dùng cho dev cục bộ.

---

## Ma trận quyết định

```
Bạn cần publish/subscribe (fan-out tới nhiều consumer)?
├── CÓ → NATS  (pub/sub low-latency, không cần persistence)
│         RabbitMQ  (pub/sub + đảm bảo delivery bền vững)
└── KHÔNG → Đây là lời gọi request/reply giữa hai service?
          ├── CÓ → Bạn cần type safety ở tầng wire + streaming + mTLS?
          │         ├── CÓ → gRPC
          │         └── KHÔNG → Đây chỉ dùng cho dev/local?
          │                   ├── CÓ → TCP
          │                   └── KHÔNG → gRPC
          └── KHÔNG → event fire-and-forget?
                    └── NATS emit / RabbitMQ publish
```

---

## So sánh nhanh

| | gRPC | TCP | NATS | RabbitMQ |
|---|---|---|---|---|
| **Tốt nhất cho** | RPC có kiểu, thông lượng cao, đa ngôn ngữ | dev cục bộ, monorepo | pub/sub, fan-out | hàng đợi bền vững, hàng đợi công việc |
| **Type safety** | Proto codegen | `any` | `any` | `any` |
| **Streaming** | Hai chiều | Không | Không | Không |
| **Delivery bền vững** | Không | Không | (JetStream) | (ack/nack) |
| **Fan-out** | Không | Không | Có | Có (exchange) |
| **Thứ tự** | theo stream | Có | Không | theo queue |
| **mTLS** | Hỗ trợ gốc | Không | Qua TLS | Có |
| **Hạ tầng thêm** | không | không | NATS server | RabbitMQ broker |
| **Độ ổn định NestJS** | Ổn định | Ổn định | Ổn định | Ổn định |

---

## gRPC — mặc định đề xuất

**Dùng khi:**
- Bạn muốn type safety lúc biên dịch qua ranh giới service (proto codegen)
- Hiệu năng quan trọng (HTTP/2 binary framing, multiplexing, nén)
- Bạn cần streaming (server-push, hai chiều)
- Bạn vận hành trong môi trường đa ngôn ngữ (Java/Go/Python cũng gọi service này)
- Bạn cần mTLS cho xác thực service-to-service

**Tránh khi:**
- Bạn cần pub/sub fan-out (gRPC là point-to-point)
- Team chưa sẵn sàng bảo trì file `.proto`

### Cấu hình NestJS

```ts
// server (nhận lời gọi)
TransportModule.register({
  grpc: {
    url: '0.0.0.0:5000',
    package: 'order',
    protoPath: join(__dirname, 'proto/order.proto'),
  },
})

// client (thực hiện lời gọi)
TransportModule.register({
  clients: {
    ORDER_SERVICE: {
      transport: 'grpc',
      options: {
        url: 'order-service:5000',
        package: 'order',
        protoPath: join(__dirname, 'proto/order.proto'),
      },
    },
  },
})
```

### Lời gọi có kiểu với `ServiceClient<T>`

```ts
interface OrderService {
  findOrder(data: { id: string }): OrderDto;
  createOrder(data: CreateOrderDto): OrderDto;
}

// Type-safe: TypeScript biết kiểu trả về từ interface
const order = await orderClient.call('findOrder', { id: '123' });
//    ^-- OrderDto (không phải `any`)
```

### Proto codegen

Sử dụng script đi kèm để tạo TypeScript type từ file `.proto`:

```bash
./scripts/proto-gen.sh proto/ generated/
```

Tạo ra interface có kiểu khớp với generic `ServiceClient<T>`.

---

## TCP — dev cục bộ / monorepo đơn giản

**Dùng khi:**
- Chỉ phát triển cục bộ
- Tất cả service trong cùng network / pod
- Bạn không cần persistence, fan-out, hay type safety

**Tránh trong production** — TCP transport không có:
- Message persistence (crash = mất message)
- Auth hoặc TLS tích hợp
- Discovery hoặc load balancing

```ts
TransportModule.register({
  tcp: { host: '0.0.0.0', port: 3001 },
  clients: {
    USER_SERVICE: {
      transport: 'tcp',
      options: { host: 'user-service', port: 3001 },
    },
  },
})
```

---

## NATS — pub/sub, fan-out

**Dùng khi:**
- Nhiều consumer cần cùng event (fan-out)
- Bạn muốn messaging fire-and-forget low-latency
- Bạn cần routing dựa trên subject (pattern wildcard)
- JetStream cho persistence nhẹ (không phải full ngữ nghĩa hàng đợi bền vững)

**Tránh khi:**
- Bạn cần delivery đảm bảo một lần với ack/nack thủ công (dùng RabbitMQ)
- Bạn cần thứ tự message nghiêm ngặt giữa các consumer

```ts
TransportModule.register({
  nats: { url: 'nats://nats-server:4222', queue: 'order-group' },
  clients: {
    EVENT_BUS: {
      transport: 'nats',
      options: { url: 'nats://nats-server:4222' },
    },
  },
})

// Event fire-and-forget
orderClient.emit('order.created', { orderId: '123', userId: '456' });
```

**Queue group:** Đặt `queue` phía server để phân phối công việc giữa các instance (pattern competing consumer). Không có `queue`, tất cả subscriber nhận mọi message.

---

## RabbitMQ — hàng đợi bền vững, phân phối công việc

**Dùng khi:**
- Bạn cần **delivery đảm bảo** (ack/nack, dead-letter queue)
- Bạn cần **hàng đợi công việc** (một consumer mỗi message, phân tán)
- Bạn cần **routing phức tạp** (exchange: direct, topic, fanout)
- Message phải tồn tại qua broker restart

**Tránh khi:**
- Latency quan trọng (acknowledgement RabbitMQ thêm overhead)
- Bạn chỉ cần request/reply đơn giản (gRPC gọn hơn)

```ts
TransportModule.register({
  rabbitmq: {
    urls: ['amqp://rabbitmq:5672'],
    queue: 'orders',
    queueOptions: { durable: true },   // tồn tại qua broker restart
  },
  clients: {
    ORDER_QUEUE: {
      transport: 'rabbitmq',
      options: {
        urls: ['amqp://rabbitmq:5672'],
        queue: 'orders',
        queueOptions: { durable: true },
      },
    },
  },
})
```

---

## ResilientClient — bọc bất kỳ transport nào

Bất kể transport nào bạn chọn, bọc `ClientProxy` trong `createResilientClient` để có timeout, retry, và circuit breaker miễn phí:

```ts
import { createResilientClient } from 'nestjs-boot/transport';

const orderClient = createResilientClient<OrderService>(clientProxy, {
  timeout: 5_000,                        // thất bại sau 5s
  retry: { maxAttempts: 3, backoff: 'exponential' },
  circuitBreaker: { failureThreshold: 5, resetTimeout: 30_000 },
});

// Hoạt động với gRPC, TCP, NATS, RabbitMQ — cùng API
const order = await orderClient.call('findOrder', { id: '123' });
```

---

## Tổng kết: khi nào chuyển đổi

| Tín hiệu | Chuyển sang |
|---|---|
| Cần type safety + hiệu năng | gRPC |
| Nhiều service dùng cùng event | NATS |
| Không được mất message | RabbitMQ |
| Chỉ dùng dev cục bộ | TCP |
| Cần kết nối lại khi pod restart (k8s) | + `ServiceDiscoveryHook` |
| Lỗi lặp lại → fast-fail | + `circuitBreaker` trong `ResilientClient` |

---

## Đọc thêm

- `src/transport/resilient-client.ts` — wrapper timeout + retry + circuit breaker
- `src/transport/service-discovery.ts` — hook phân giải URL động
- `src/transport/error-context.interceptor.ts` — ngữ cảnh lỗi cross-service
- `scripts/proto-gen.sh` — tạo TypeScript type từ file `.proto`
- Tài liệu NestJS: [Microservices](https://docs.nestjs.com/microservices/basics)
