# Tuần 9: Microservices & Inter-service Communication

> **Stage 3 — Advanced | nestjs-boot Teaching Series**
> Yêu cầu: Đã hoàn thành Stage 1-2 (TypeScript, NestJS, MongoDB, REST API, Auth, Cache, Testing)

---

## Mục tiêu học tập

Sau bài này, sinh viên có thể:
- Giải thích được khi nào nên dùng Microservices, khi nào KHÔNG nên
- Mô tả các communication patterns: sync vs async
- Hiểu gRPC và Protocol Buffers hoạt động như thế nào
- Implement Correlation ID để trace request qua nhiều service
- Chạy được hệ thống 10-service trong nestjs-boot examples
- Viết được service mới, kết nối vào hệ thống hiện có

---

## 1. Monolith vs Microservices — Đừng vội tin "Microservices luôn tốt hơn"

### 1.1 Monolith không phải kẻ thù

```
MONOLITH (Tốt cho giai đoạn đầu)
┌─────────────────────────────────────┐
│           Single Process            │
│  ┌──────┐  ┌──────┐  ┌──────────┐  │
│  │ Auth │  │Order │  │ Product  │  │
│  └──┬───┘  └──┬───┘  └────┬─────┘  │
│     └─────────┴───────────┘        │
│              DB                    │
└─────────────────────────────────────┘
```

**Ưu điểm Monolith:**
- Gọi function giữa modules = gọi trong cùng process → nhanh, không qua network
- Debug dễ: stack trace liên tục
- Transaction ACID thực sự: 1 DB transaction bao trùm toàn bộ business logic
- Deployment đơn giản: 1 container, 1 CI/CD pipeline
- Phù hợp team < 10 người

**Khi nào Monolith đủ tốt:** Startup, MVP, team nhỏ, traffic chưa cao, business domain chưa rõ ràng.

### 1.2 Vấn đề của Monolith khi scale

```
VẤN ĐỀ KHI MONOLITH LỚN DẦN

Team A (Auth)   Team B (Order)   Team C (Product)
      │                │                │
      └────────────────┴────────────────┘
                       │
              1 deployment pipeline
              "Merge hell" — conflict hằng ngày
              1 service chậm → cả hệ thống chậm
              Không thể scale riêng từng phần
```

**Dấu hiệu cần xem xét Microservices:**
- Deploy mỗi ngày nhưng cần freeze toàn bộ system
- Team A phải chờ Team B để release
- 1 module cần 10x CPU nhưng không thể scale riêng
- Codebase lớn đến mức không ai hiểu toàn bộ

### 1.3 Conway's Law — Luật quan trọng nhất

> "Các tổ chức thiết kế hệ thống... là bản sao của cấu trúc giao tiếp của tổ chức đó."
> — Melvin Conway, 1967

**Nghĩa là:** Nếu có 3 team, bạn sẽ tạo ra 3 service. Nếu có 1 team, bạn tạo ra 1 monolith.
**Đừng chia service theo technical layer** (DB service, API service). Hãy chia theo **business capability** (Order, Product, Notification).

### 1.4 Trade-offs thực tế của Microservices

| Vấn đề | Monolith | Microservices |
|--------|----------|---------------|
| Network call | Function call (~μs) | HTTP/gRPC (~ms) |
| Transaction | ACID, 1 DB | Không có distributed transaction thực sự |
| Debug | Stack trace liên tục | Cần Distributed Tracing (Jaeger) |
| Deployment | 1 pipeline | N pipelines |
| Data consistency | Strong | Eventual |
| Team autonomy | Thấp | Cao |

---

## 2. Communication Patterns

### 2.1 Synchronous — "Hỏi và chờ trả lời"

```
Service A ────── HTTP/gRPC ──────> Service B
        <──────── Response ─────────

Analogy: Gọi điện thoại — bạn phải chờ người kia nghe máy mới tiếp tục
```

**Khi dùng:** Cần kết quả ngay để tiếp tục (ví dụ: validate user trước khi tạo order)

**Vấn đề:** Nếu Service B chậm → Service A chậm theo → Cascading failures

### 2.2 Asynchronous — "Gửi và quên"

```
Service A ──── Message ──────> Queue/Broker
                                    │
                                    ▼ (sau đó)
                              Service B lấy message và xử lý

Analogy: Gửi email — bạn gửi xong tiếp tục làm việc khác,
         người nhận đọc khi có thời gian
```

**Khi dùng:** Không cần kết quả ngay (gửi email, tạo thumbnail, ghi audit log)

**Ưu điểm:** Service B down → message được lưu trong queue, xử lý khi service back online

### 2.3 Chọn sync hay async?

```
Quyết định đơn giản:

Caller có cần response để tiếp tục không?
├── CÓ → Sync (gRPC, REST)
│         Ví dụ: Lấy thông tin user để hiển thị
└── KHÔNG → Async (Queue, Event)
            Ví dụ: Gửi email welcome sau khi đăng ký
```

---

## 3. gRPC Deep-Dive — Tại sao nhanh hơn REST?

### 3.1 Protocol Buffers — Dữ liệu binary, không phải JSON

```
JSON (REST):
{"userId": "abc123", "amount": 99.99, "currency": "USD"}
→ 51 bytes, human-readable, slow parse

Protocol Buffers (gRPC):
[binary data: 0x0a 0x06 0x61 0x62 0x63 0x31...]
→ ~15 bytes, không đọc được bằng mắt, fast parse
```

**So sánh:**
- Serialize: Protobuf **~6x nhanh hơn** JSON
- Payload size: **~3-5x nhỏ hơn** JSON
- Schema: **bắt buộc định nghĩa** (type safety across languages)

### 3.2 Định nghĩa .proto file

```protobuf
// proto/order.proto
syntax = "proto3";
package order;

service OrderService {
  rpc CreateOrder (CreateOrderRequest) returns (OrderResponse);
  rpc GetOrder    (GetOrderRequest)    returns (OrderResponse);
  rpc ListOrders  (ListOrdersRequest)  returns (stream OrderResponse); // Streaming!
}

message CreateOrderRequest {
  string customer_id = 1;
  repeated OrderItem items = 2;
}

message OrderItem {
  string sku = 1;
  int32  qty = 2;
  double price = 3;
}

message OrderResponse {
  string id = 1;
  string status = 2;
  double total = 3;
  string created_at = 4;
}

message GetOrderRequest {
  string id = 1;
}

message ListOrdersRequest {
  string customer_id = 1;
  int32  limit = 2;
}
```

### 3.3 HTTP/2 — Lý do gRPC nhanh hơn HTTP/1.1

```
HTTP/1.1:
Request 1 ──────────────────> Response 1
                     Request 2 ──> Response 2
(phải chờ response trước rồi mới gửi request sau)

HTTP/2 (Multiplexing):
Request 1 ──┐
Request 2 ──┤──── 1 Connection ────> Response 1
Request 3 ──┘                        Response 2
                                     Response 3
(tất cả trong cùng 1 TCP connection, song song)
```

**HTTP/2 features gRPC tận dụng:**
- Multiplexing: nhiều request/response trên 1 connection
- Header compression: giảm overhead
- Binary framing: nhanh hơn text parsing
- Server push: server chủ động gửi data (streaming)

### 3.4 Streaming patterns

```
Unary (thông thường):
Client ──── 1 request ───> Server ──── 1 response ───> Client

Server streaming:
Client ──── 1 request ───> Server ──── nhiều response ──> Client
(ví dụ: live feed, log streaming)

Client streaming:
Client ──── nhiều request ─> Server ──── 1 response ────> Client
(ví dụ: upload file từng chunk)

Bidirectional streaming:
Client <──── nhiều request/response ────> Server
(ví dụ: real-time chat)
```

### 3.5 Implement gRPC trong nestjs-boot

nestjs-boot sử dụng `TransportModule` để kết nối tới gRPC services.

**File:** `src/transport/transport.module.ts`

```typescript
// main.ts — Service nhận gRPC calls (gRPC server)
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  transport: {
    grpc: {
      url: '0.0.0.0:5000',           // lắng nghe trên port 5000
      package: 'order',              // package name trong .proto
      protoPath: './proto/order.proto',
    },
  },
});
```

```typescript
// app.module.ts — Client gọi tới gRPC service khác
import { TransportModule } from 'nestjs-boot';

@Module({
  imports: [
    TransportModule.register({
      clients: {
        ORDER_SERVICE: {
          transport: 'grpc',
          options: {
            url: 'order-service:5000',    // hostname:port
            package: 'order',
            protoPath: './proto/order.proto',
          },
        },
      },
    }),
  ],
})
export class AppModule {}
```

```typescript
// order.gateway.ts — gọi tới Order Service từ API Gateway
import { Injectable } from '@nestjs/common';
import { InjectClient } from 'nestjs-boot';
import { ServiceClient } from 'nestjs-boot';

// Định nghĩa interface cho type safety
interface OrderServiceInterface {
  createOrder(data: CreateOrderRequest): OrderResponse;
  getOrder(data: { id: string }): OrderResponse;
}

@Injectable()
export class OrderGateway {
  private client: ServiceClient<OrderServiceInterface>;

  constructor(@InjectClient('ORDER_SERVICE') rawClient: any) {
    this.client = new ServiceClient(rawClient);
  }

  async createOrder(data: CreateOrderRequest): Promise<OrderResponse> {
    // Type-safe call — autocomplete hoạt động!
    return this.client.call('createOrder', data);
  }
}
```

Xem ví dụ thực tế: `examples/microservices/api-gateway/src/order/order.gateway.ts`

---

## 4. Service Discovery — Service A tìm Service B như thế nào?

### 4.1 Vấn đề

```
Trong Kubernetes, Service B có thể chạy trên nhiều pod:
  order-service-pod-1: 10.0.0.5:5000
  order-service-pod-2: 10.0.0.6:5000
  order-service-pod-3: 10.0.0.7:5000

→ Service A dùng IP nào?
```

### 4.2 Các giải pháp

**1. DNS-based (đơn giản nhất, dùng trong Kubernetes):**
```
Service A gọi: order-service:5000
Kubernetes DNS tự resolve → 1 trong các pod đang healthy
```

**2. Service Registry (Consul, etcd):**
```
Service B khởi động → đăng ký vào Consul: "order-service tại 10.0.0.5:5000"
Service A hỏi Consul: "order-service ở đâu?" → nhận IP
```

**3. Environment variables (development):**
```
ORDER_SERVICE_URL=order-service:5000  # trong docker-compose
```

### 4.3 nestjs-boot ServiceDiscoveryHook

File: `src/transport/service-discovery.ts`

```typescript
// Implement dynamic URL resolution
class ConsulDiscovery implements ServiceDiscoveryHook {
  constructor(private consul: ConsulClient, private svc: string) {}

  async resolve(): Promise<{ url: string }> {
    const address = await this.consul.resolve(this.svc);
    return { url: `${address}:5000` };
  }
}

// Wire vào TransportModule
TransportModule.register({
  clients: {
    ORDER_SERVICE: {
      transport: 'grpc',
      options: { package: 'order', protoPath: './order.proto' },
      discover: new ConsulDiscovery(consulClient, 'order-service'),
    },
  },
});
```

---

## 5. API Gateway Pattern

### 5.1 Vấn đề không có API Gateway

```
Client phải biết địa chỉ từng service:
  order-service:3001/orders
  product-service:3002/products
  auth-service:3003/auth

→ Client phức tạp, mỗi service phải tự xử lý auth/rate limit
```

### 5.2 API Gateway giải quyết

```
Client ──────────────────> API Gateway :3000
                                │
                    ┌───────────┼───────────┐
                    │           │           │
               /orders     /products     /auth
                    │           │           │
               Order Svc   Product Svc  Auth Svc
```

**API Gateway chịu trách nhiệm:**
- Routing: `/orders` → Order Service
- Authentication: verify JWT 1 lần, không cần từng service
- Rate limiting: chống DDoS
- Request/Response transformation
- Logging & Monitoring tập trung

**Xem ví dụ:** `examples/microservices/api-gateway/`

---

## 6. Correlation ID — Trace request xuyên suốt hệ thống

### 6.1 Vấn đề

```
User báo: "Tôi tạo order lúc 14:32 và bị lỗi"

Log của Order Service:
  14:32:01 ERROR Cannot reserve inventory

Log của Inventory Service:
  14:32:01 ERROR Out of stock for SKU-ABC
  14:31:59 INFO  Reserved 5 items for order xyz
  14:32:01 WARN  Cannot reserve 10 items

→ Request nào là của user đó? Không biết!
```

### 6.2 Giải pháp: Correlation ID

```
Client ──── X-Correlation-Id: req-abc-123 ──────> API Gateway
                                                       │
                              X-Correlation-Id: req-abc-123
                                                       │
                                                  Order Service
                                                       │
                              X-Correlation-Id: req-abc-123
                                                       │
                                               Inventory Service

Log của tất cả services đều có: correlationId: "req-abc-123"
→ Grep log bằng correlation ID → thấy toàn bộ flow!
```

### 6.3 nestjs-boot CorrelationModule

File: `src/correlation/correlation.module.ts`, `src/correlation/correlation.middleware.ts`

```typescript
// app.module.ts — đăng ký 1 lần, áp dụng cho tất cả routes
import { CorrelationModule } from 'nestjs-boot';

@Module({
  imports: [
    CorrelationModule.register({
      header: 'X-Correlation-Id',   // default
      generator: () => randomUUID(), // default
    }),
  ],
})
export class AppModule {}
```

**Cách hoạt động (AsyncLocalStorage):**

```typescript
// correlation.middleware.ts (simplified)
use(req: Request, res: Response, next: NextFunction): void {
  const correlationId = req.headers['x-correlation-id'] || randomUUID();

  res.setHeader('X-Correlation-Id', correlationId);

  // AsyncLocalStorage: lưu correlationId trong "context" của request
  // Tất cả code chạy trong request này đều có thể đọc correlationId
  correlationStorage.run({ correlationId }, () => {
    next();
  });
}
```

```typescript
// Đọc correlationId ở bất kỳ đâu trong request lifecycle
import { getCorrelationId } from 'nestjs-boot';

@Injectable()
export class OrderService {
  createOrder() {
    const corrId = getCorrelationId(); // "req-abc-123"
    this.logger.log(`Creating order`, { correlationId: corrId });
    // Khi gọi gRPC tới service khác, ServiceClient tự inject correlationId
  }
}
```

**ServiceClient tự động forward Correlation ID:**

File: `src/transport/service-client.ts`

```typescript
// Trong ServiceClient.call():
async call(method, data) {
  const metadata = withCorrelationId({}); // lấy từ AsyncLocalStorage
  const payload = { ...data, __metadata: metadata };
  return firstValueFrom(this.client.send(method, payload));
}
```

---

## 7. Inter-Service Authentication

### 7.1 Vấn đề

```
User gửi JWT ─────> API Gateway ─────> Order Service
                        │
              Verify JWT (ok)
                        │
                   Order Service ────> Inventory Service
                        │
              Inventory Service có biết user này là ai không?
```

### 7.2 nestjs-boot InterServiceAuthModule

File: `src/inter-service-auth/`

```typescript
// API Gateway — extract và propagate auth từ request gốc
InterServiceAuthModule.register({
  propagation: 'jwt',           // forward JWT tới downstream services
  serviceToken: 'my-svc-token', // fallback khi không có user context (service-to-service)
})
```

```typescript
// Các service downstream — nhận auth từ metadata
// AuthPropagationInterceptor tự động extract từ __metadata của gRPC call
// và lưu vào AuthContextStorage (AsyncLocalStorage)

import { getAuthContext } from 'nestjs-boot';

@Injectable()
export class InventoryService {
  reserveInventory() {
    const authCtx = getAuthContext();
    // authCtx.token = JWT của user gốc
    // → có thể verify user permissions ở đây
  }
}
```

---

## 8. Data Consistency — Thách thức lớn nhất của Microservices

### 8.1 Không có Distributed Transaction thực sự

```
Monolith:
BEGIN TRANSACTION
  INSERT orders (...)
  UPDATE inventory (stock = stock - 1)
COMMIT  ← hoặc ROLLBACK nếu lỗi

Microservices:
Order Service → INSERT orders ✓
Order Service → gRPC → Inventory Service → UPDATE inventory
                         ↑
              Nếu Inventory Service timeout ở đây?
              Order đã được tạo nhưng inventory chưa được giảm!
```

### 8.2 Eventual Consistency

```
GIẢI PHÁP: Chấp nhận eventual consistency

Order Service:
1. Tạo order với status = PENDING
2. Emit event: OrderCreated
3. Trả về success ngay (không chờ inventory)

Inventory Service (subscriber):
4. Nhận OrderCreated event
5. Giảm stock
6. Emit: InventoryReserved hoặc InventoryFailed

Order Service (subscriber):
7. Nhận InventoryReserved → update status = CONFIRMED
   Nhận InventoryFailed → update status = CANCELLED, refund
```

**Trade-off:** Trong khoảng thời gian giữa bước 1-7, data không nhất quán. Điều này có chấp nhận được không phụ thuộc vào business requirement.

### 8.3 Saga Pattern (preview, sẽ học kỹ hơn ở Tuần 11)

```
Nếu step N fail → chạy compensating actions ngược lại:

Step 1: Reserve Inventory ──── fail → Compensation: Release inventory
Step 2: Charge Payment    ──── fail → Compensation: Refund payment
Step 3: Create Shipment   ──── fail → Compensation: Cancel shipment
```

---

## 9. Kiến trúc 10-Service trong nestjs-boot Examples

### 9.1 Tổng quan

```
examples/microservices/
├── api-gateway/          # :3000 — Single entry point
├── auth-service/         # :3003/:5001 — JWT auth, user management
├── order-service/        # :3001/:5003 — Order management
├── product-service/      # :3002/:5002 — Product catalog
├── notification-service/ # :3004/:5004 — Email/SMS notifications
├── file-service/         # :3005/:5005 — File upload/storage
├── scheduler-service/    # :3006/:5006 — Cron jobs, scheduled tasks
├── blog-service/         # :3007/:5007 — Content management
├── fulfillment-service/  # :3008/:5008 — Order fulfillment
├── campaign-service/     # :3009/:5009 — Marketing campaigns
├── proto/                # Shared .proto files
└── docker-compose.yml
```

### 9.2 Flow: Tạo một Order

```
Client
  │ POST /orders
  ▼
API Gateway :3000
  │ Verify JWT (gRPC → Auth Service)
  │ Forward request
  ▼
Order Service :5003
  │ Validate order data
  │ Call gRPC → Product Service (kiểm tra sản phẩm)
  │ Emit event: OrderCreated
  ▼
Notification Service (subscriber)
  │ Nhận OrderCreated
  │ Gửi email xác nhận

Fulfillment Service (subscriber)
  │ Nhận OrderCreated
  │ Tạo shipment
```

---

## 10. Hands-on: Chạy hệ thống 10-service

### Bước 1: Cài đặt

```bash
cd examples/microservices
docker-compose up -d mongodb redis
```

### Bước 2: Chạy từng service

```bash
# Terminal 1: Auth Service
cd auth-service && npm install && npm run start:dev

# Terminal 2: Order Service
cd order-service && npm install && npm run start:dev

# Terminal 3: API Gateway
cd api-gateway && npm install && npm run start:dev
```

### Bước 3: Test flow cơ bản

```bash
# Đăng ký user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Password123!"}'

# Đăng nhập, lấy JWT
curl -X POST http://localhost:3000/auth/login \
  -d '{"email": "test@example.com", "password": "Password123!"}'

# Tạo order (cần JWT)
curl -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"sku": "SKU-001", "qty": 2}]}'
```

### Bước 4: Trace Correlation ID

```bash
# Gửi request với Correlation ID
curl -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Correlation-Id: my-trace-001" \
  -d '{"items": [...]}'

# Xem logs của từng service — tất cả đều có correlationId: "my-trace-001"
```

---

## 11. Bài tập thực hành

### Exercise 1: Thêm service mới — Review Service

Tạo service cho phép user review sản phẩm.

**Yêu cầu:**
1. Tạo folder `review-service/`
2. Định nghĩa `proto/review.proto`:
   ```protobuf
   service ReviewService {
     rpc CreateReview (CreateReviewRequest) returns (ReviewResponse);
     rpc GetProductReviews (GetReviewsRequest) returns (ReviewListResponse);
   }
   ```
3. Implement ReviewService với MongoDB
4. Thêm route vào API Gateway: `POST /reviews`, `GET /products/:id/reviews`
5. Khi review được tạo, emit event → Notification Service gửi email cảm ơn

### Exercise 2: Implement Correlation ID logging

Trong tất cả services, thêm Correlation ID vào mỗi log line:
```typescript
// Mục tiêu: tất cả logs có format
// {"level":"info","correlationId":"req-abc-123","msg":"Creating review","service":"review-service"}
```

### Homework

Nghiên cứu và trả lời:
1. Netflix dùng gì để manage ~700 microservices? (gợi ý: Eureka, Zuul, Hystrix)
2. GraphQL Federation là gì? Khi nào dùng thay vì REST API Gateway?
3. Service Mesh (Istio, Linkerd) khác API Gateway như thế nào?

---

## 12. Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `Cannot connect to gRPC server` | Service chưa start hoặc sai port | Kiểm tra `docker-compose ps`, check URL trong config |
| `Proto file not found` | Đường dẫn protoPath sai | Dùng absolute path hoặc path.join(__dirname, ...) |
| `@nestjs/microservices not installed` | Thiếu dependency | `npm i @nestjs/microservices @grpc/grpc-js @grpc/proto-loader` |
| Correlation ID không được forward | Không dùng ServiceClient | Dùng `new ServiceClient(rawClient).call(...)` thay vì gọi trực tiếp |
| `Cascading timeout` | Service A chờ B, B chờ C | Implement circuit breaker (xem `src/resilience/`) |
| Data không nhất quán | Dùng sync call cho distributed transaction | Chuyển sang async events + Saga pattern |

---

## 13. Self-check Questions

1. **Tại sao** không nên chia microservice theo layer kỹ thuật (DB layer, API layer)?
2. Giải thích **AsyncLocalStorage** dùng để làm gì trong CorrelationModule.
3. Service A gọi Service B qua gRPC, B trả về lỗi 503. Điều gì xảy ra với request của A? Làm thế nào để handle?
4. Vẽ sơ đồ flow đầy đủ khi user đặt order trong hệ thống 10-service.
5. Eventual consistency có nghĩa là gì? Cho ví dụ thực tế.

---

## 14. Đọc thêm

- [Martin Fowler — Microservices](https://martinfowler.com/articles/microservices.html) — bài gốc định nghĩa microservices
- [Sam Newman — Building Microservices](https://samnewman.io/books/building_microservices/) — sách reference
- [gRPC Official Docs](https://grpc.io/docs/languages/node/) — Node.js gRPC guide
- [nestjs-boot source] `src/transport/` — TransportModule implementation
- [nestjs-boot source] `src/correlation/` — CorrelationModule implementation
- [nestjs-boot source] `examples/microservices/` — 10-service example
- [You Don't Need Microservices](https://www.youtube.com/watch?v=sDiWV6m8zpg) — DHH talk về khi nào monolith tốt hơn

---

*Tuần tiếp theo: [Tuần 10 — Message Queue & Background Jobs](./week-10-queue.md)*
