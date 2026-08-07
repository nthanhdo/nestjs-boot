# Transport Selection Guide

> **TL;DR** — Start with **gRPC**. Switch to NATS when you need pub/sub fan-out.
> Use RabbitMQ when you need durable, acknowledged queues. TCP is for local dev only.

---

## Decision Matrix

```
Do you need publish/subscribe (fan-out to multiple consumers)?
├── YES → NATS  (low-latency pub/sub, no persistence needed)
│         RabbitMQ  (pub/sub + durable delivery guarantee)
└── NO  → Is this a request/reply call between two services?
          ├── YES → Do you need wire-level type safety + streaming + mTLS?
          │         ├── YES → gRPC
          │         └── NO  → Is this dev/local only?
          │                   ├── YES → TCP
          │                   └── NO  → gRPC
          └── NO  → fire-and-forget event?
                    └── NATS emit / RabbitMQ publish
```

---

## Quick Comparison

| | gRPC | TCP | NATS | RabbitMQ |
|---|---|---|---|---|
| **Best for** | typed RPC, high-throughput, polyglot | local dev, monorepo | pub/sub, fan-out | durable queues, work queues |
| **Type safety** | ✅ proto codegen | ❌ `any` | ❌ `any` | ❌ `any` |
| **Streaming** | ✅ bi-directional | ❌ | ❌ | ❌ |
| **Durable delivery** | ❌ | ❌ | ✅ (JetStream) | ✅ (ack/nack) |
| **Fan-out** | ❌ | ❌ | ✅ | ✅ (exchanges) |
| **Ordering** | per-stream | ✅ | ❌ | per-queue |
| **mTLS** | ✅ native | ❌ | ✅ via TLS | ✅ |
| **Extra infra** | none | none | NATS server | RabbitMQ broker |
| **NestJS maturity** | ✅ stable | ✅ stable | ✅ stable | ✅ stable |

---

## gRPC — recommended default

**Use when:**
- You want compile-time type safety across service boundaries (proto codegen)
- Performance matters (HTTP/2 binary framing, multiplexing, compression)
- You need streaming (server-push, bi-directional)
- You operate in a polyglot environment (Java/Go/Python also call this service)
- You need mTLS for service-to-service authentication

**Avoid when:**
- You need pub/sub fan-out (gRPC is point-to-point)
- Your team isn't ready to maintain `.proto` files

### NestJS config

```ts
// server (receives calls)
TransportModule.register({
  grpc: {
    url: '0.0.0.0:5000',
    package: 'order',
    protoPath: join(__dirname, 'proto/order.proto'),
  },
})

// client (makes calls)
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

### Typed call with `ServiceClient<T>`

```ts
interface OrderService {
  findOrder(data: { id: string }): OrderDto;
  createOrder(data: CreateOrderDto): OrderDto;
}

// Type-safe: TypeScript knows the return type from the interface
const order = await orderClient.call('findOrder', { id: '123' });
//    ^-- OrderDto (not `any`)
```

### Proto codegen

Use the provided script to generate TypeScript types from `.proto` files:

```bash
./scripts/proto-gen.sh proto/ generated/
```

This produces typed interfaces that match your `ServiceClient<T>` generic.

---

## TCP — local dev / simple monorepo

**Use when:**
- Local development only
- All services are in the same network / pod
- You don't need persistence, fan-out, or type safety

**Avoid in production** — TCP transport has no:
- Message persistence (crash = lost message)
- Built-in auth or TLS
- Discovery or load balancing

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

**Use when:**
- Multiple consumers need the same event (fan-out)
- You want low-latency fire-and-forget messaging
- You need subject-based routing (wildcard patterns)
- JetStream for light persistence (not full durable queue semantics)

**Avoid when:**
- You need guaranteed once-delivery with manual ack/nack (use RabbitMQ)
- You need strict message ordering across consumers

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

// Fire-and-forget event
orderClient.emit('order.created', { orderId: '123', userId: '456' });
```

**Queue groups:** Set `queue` on the server side to distribute work among instances
(competing consumer pattern). Without `queue`, all subscribers get every message.

---

## RabbitMQ — durable queues, work distribution

**Use when:**
- You need **guaranteed delivery** (ack/nack, dead-letter queues)
- You need **work queues** (one consumer per message, distributed)
- You need **complex routing** (exchanges: direct, topic, fanout)
- Messages must survive broker restart

**Avoid when:**
- Latency is critical (RabbitMQ acknowledgement adds overhead)
- You just need simple request/reply (gRPC is cleaner)

```ts
TransportModule.register({
  rabbitmq: {
    urls: ['amqp://rabbitmq:5672'],
    queue: 'orders',
    queueOptions: { durable: true },   // survive broker restart
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

## ResilientClient — wrapping any transport

Regardless of which transport you choose, wrap your `ClientProxy` in
`createResilientClient` to get timeout, retry, and circuit breaker for free:

```ts
import { createResilientClient } from 'nestjs-boot/transport';

const orderClient = createResilientClient<OrderService>(clientProxy, {
  timeout: 5_000,                        // fail after 5s
  retry: { maxAttempts: 3, backoff: 'exponential' },
  circuitBreaker: { failureThreshold: 5, resetTimeout: 30_000 },
});

// Works with gRPC, TCP, NATS, RabbitMQ — same API
const order = await orderClient.call('findOrder', { id: '123' });
```

---

## Summary: when to switch

| Signal | Switch to |
|---|---|
| Need type safety + performance | gRPC |
| Multiple services consume same event | NATS |
| Cannot afford to lose a message | RabbitMQ |
| Only in local dev | TCP |
| Need reconnect on pod restart (k8s) | + `ServiceDiscoveryHook` |
| Repeated failures → fast-fail | + `circuitBreaker` in `ResilientClient` |

---

## Further reading

- `src/transport/resilient-client.ts` — timeout + retry + circuit breaker wrapper
- `src/transport/service-discovery.ts` — dynamic URL resolution hook
- `src/transport/error-context.interceptor.ts` — cross-service error context
- `scripts/proto-gen.sh` — generate TypeScript types from `.proto` files
- NestJS docs: [Microservices](https://docs.nestjs.com/microservices/basics)
