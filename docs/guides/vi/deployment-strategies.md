# Chiến Lược Triển Khai

> **TL;DR** — nestjs-boot hoạt động tốt nhất dưới dạng container chạy liên tục. Hướng dẫn này so sánh ba chế độ triển khai — stateless, stateful, và serverless — với ví dụ cấu hình, đánh đổi, và framework ra quyết định giúp bạn chọn đúng.

---

## Mục Lục

1. [Triển Khai Stateless](#triển-khai-stateless)
2. [Triển Khai Stateful](#triển-khai-stateful)
3. [Triển Khai Serverless](#triển-khai-serverless)
4. [Bảng So Sánh](#bảng-so-sánh)
5. [Framework Ra Quyết Định](#framework-ra-quyết-định)

---

## Triển Khai Stateless

Stateless là chế độ mặc định và được khuyến nghị. Mọi replica đều giống hệt nhau và có thể thay thế — không có request affinity, không có local state.

### Điều Gì Khiến Ứng Dụng nestjs-boot Là Stateless

Một ứng dụng nestjs-boot là stateless khi:

- **Database** nằm bên ngoài (MongoDB Atlas, replica set tự host)
- **Cache** nằm bên ngoài (Redis, không phải in-memory)
- **Session** được lưu trong Redis (không phải in-memory store mặc định)
- **File upload** đi vào object storage (S3, GCS), không phải local disk
- **Không có WebSocket** hoặc WebSocket sử dụng Redis adapter (pub/sub giữa các replica)

Nguyên tắc chính: bất kỳ replica nào cũng có thể xử lý bất kỳ request nào. Tắt một replica, khởi động cái khác — người dùng không nhận ra gì.

### Cấu Hình Cho Stateless

```ts
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  database: {
    connections: {
      master: { writerUri: process.env.MONGO_URI! },
    },
  },
  cache: {
    redis: { url: process.env.REDIS_URL! },
  },
  session: {
    store: 'redis',  // KHÔNG dùng 'memory'
    secret: process.env.SESSION_SECRET!,
  },
  health: { path: '/health' },
  shutdown: { gracefulTimeoutMs: 15_000 },
});
```

Nên **bật**: `HealthModule`, `ShutdownModule`, external cache, external session store.

Nên **tắt/tránh**: in-memory session store, local file storage, singleton state chứa request data.

### Docker + Kubernetes Horizontal Scaling

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0      # zero downtime
      maxSurge: 1
  template:
    spec:
      containers:
        - name: api
          image: my-api:latest
          ports:
            - containerPort: 3000
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
          lifecycle:
            preStop:
              exec:
                command: ["sh", "-c", "sleep 5"]  # chờ LB drain connection
          env:
            - name: MONGO_URI
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: mongo-uri
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: redis-url
```

### Rolling Update Với Zero Downtime

`ShutdownModule` của nestjs-boot xử lý tự động:

1. K8s gửi `SIGTERM` đến pod cũ
2. `ShutdownModule` đánh dấu health endpoint trả `503` (readiness probe fail)
3. K8s ngừng route traffic mới đến pod
4. Các request đang xử lý được drain (tối đa `gracefulTimeoutMs`)
5. Kết nối database và Redis được đóng
6. Process thoát

`preStop` sleep đảm bảo load balancer có thời gian loại pod khỏi pool trước khi shutdown bắt đầu.

### Quản Lý Session Qua Redis

Không bao giờ dùng in-memory session store mặc định trong môi trường multi-replica — session sẽ bị mất khi request đến replica khác.

```ts
const app = await createApp(AppModule, {
  session: {
    store: 'redis',
    secret: process.env.SESSION_SECRET!,
    ttl: 86400,  // 24 giờ
  },
  cache: {
    redis: { url: process.env.REDIS_URL! },
  },
});
```

Với session lưu trong Redis, bất kỳ replica nào cũng có thể tiếp tục session của người dùng.

---

## Triển Khai Stateful

Một số workload yêu cầu local state. Vận hành phức tạp hơn nhưng cần thiết trong những tình huống cụ thể.

### Khi Nào Cần Stateful

- **WebSocket connection** — client duy trì kết nối TCP liên tục đến một replica cụ thể
- **In-memory cache** — dữ liệu nóng cần sub-millisecond (Redis round-trip quá chậm)
- **Event sourcing aggregate** — CQRS read model được rebuild trong memory từ event stream
- **Tính toán dài** — background job tích lũy trạng thái trung gian
- **Workload nhiều connection** — mỗi replica quản lý connection pool riêng

### Sticky Session Với Kubernetes

Khi client phải luôn đến cùng một replica (ví dụ: WebSocket không dùng Redis adapter):

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: my-api
spec:
  type: ClusterIP
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800  # 3 giờ
  ports:
    - port: 80
      targetPort: 3000
```

Với Nginx Ingress:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-api
  annotations:
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "SERVERID"
    nginx.ingress.kubernetes.io/session-cookie-expires: "172800"
    nginx.ingress.kubernetes.io/session-cookie-max-age: "172800"
```

### StatefulSet vs Deployment

Dùng `StatefulSet` khi các replica có identity riêng biệt (ví dụ: mỗi replica sở hữu một shard dữ liệu):

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: my-api
spec:
  serviceName: my-api
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: my-api:latest
          env:
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            # Tên pod: my-api-0, my-api-1, my-api-2
            # Dùng POD_NAME để xác định shard ownership
```

Dùng `Deployment` với sticky session cho hầu hết ứng dụng web stateful. Dùng `StatefulSet` khi:
- Mỗi replica cần network identity ổn định (`my-api-0`, `my-api-1`)
- Mỗi replica cần persistent storage riêng (`volumeClaimTemplates`)
- Thứ tự startup/shutdown quan trọng

### CQRS Read Model Là Local State

Với module CQRS của nestjs-boot, read-model projection có thể được duy trì trong memory để query nhanh:

```ts
import { EventsHandler, IEventHandler } from 'nestjs-boot/cqrs';

@EventsHandler(OrderPlacedEvent)
export class OrderDashboardProjection implements IEventHandler<OrderPlacedEvent> {
  private dailyTotals = new Map<string, number>();

  handle(event: OrderPlacedEvent) {
    const date = event.timestamp.toISOString().slice(0, 10);
    const current = this.dailyTotals.get(date) ?? 0;
    this.dailyTotals.set(date, current + event.amount);
  }

  getTotals() {
    return Object.fromEntries(this.dailyTotals);
  }
}
```

Trong triển khai stateful, projection in-memory này tồn tại qua các request trên cùng replica. Trong stateless, bạn sẽ persist projection vào database.

### Connection Pooling Giữa Các Replica

Mỗi replica duy trì connection pool riêng. Lập kế hoạch pool size tương ứng:

```
Tổng connection = số_replica x poolSize
```

Nếu MongoDB cho phép 500 connection và bạn chạy 5 replica, đặt `poolSize` tối đa 100:

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: process.env.MONGO_URI!,
        options: {
          maxPoolSize: 100,  // 5 replica x 100 = 500 tổng
          minPoolSize: 10,
        },
      },
    },
  },
});
```

### Multi-Tenancy Với Database Isolation

Trong chế độ stateful với database-level tenant isolation, mỗi tenant có MongoDB connection riêng:

```ts
import { TenancyModule } from 'nestjs-boot/tenancy';

@Module({
  imports: [
    TenancyModule.register({
      strategy: 'header',
      headerName: 'X-Tenant-ID',
      isolation: 'database',  // DB riêng cho mỗi tenant
    }),
  ],
})
export class AppModule {}
```

Mỗi tenant connection được cache trong memory trên replica đầu tiên phục vụ tenant đó. Đây là bản chất stateful — connection cache nằm trong process. Với database isolation, cần lập kế hoạch:

- Số connection = `replica x active_tenant x minPoolSize`
- Bộ nhớ mỗi connection: ~1–5 MB tùy driver và query pattern
- Thời gian warm-up connection ở request đầu tiên mỗi tenant mỗi replica

Xem [hướng dẫn Multi-Tenancy](./multi-tenancy.md) để biết đầy đủ cấu hình.

### Thay Đổi Cấu Hình Cho Stateful

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: process.env.MONGO_URI!,
        options: { maxPoolSize: 100 },
      },
    },
  },
  // WebSocket không dùng Redis adapter = stateful (connection gắn với replica)
  // Với Redis adapter = có thể scale ngang (hybrid)
  health: { path: '/health' },
  shutdown: {
    gracefulTimeoutMs: 30_000,  // drain lâu hơn cho WebSocket/job chạy dài
  },
});
```

---

## Triển Khai Serverless

> Xem thêm: [Cold Start & Serverless Considerations](./serverless-considerations.md) để phân tích chi tiết cold start.

nestjs-boot được thiết kế cho service chạy liên tục. Serverless khả thi nhưng có đánh đổi.

### Tối Ưu Cold Start

Bật chế độ `lazy` để trì hoãn kết nối database và cache đến khi sử dụng lần đầu:

```ts
const app = await createApp(AppModule, {
  lazy: true,  // connection được thiết lập ở request đầu tiên, không phải lúc boot
  database: {
    connections: {
      master: { writerUri: process.env.MONGO_URI! },
    },
  },
  cache: { redis: { url: process.env.REDIS_URL! } },
});
```

Cold start không có `lazy`: 500–1500 ms. Với `lazy`: 200–600 ms.

Dùng `LazyModuleLoader` cho các module nặng không cần ở mọi request (xem hướng dẫn serverless-considerations).

### AWS Lambda + API Gateway

```ts
// src/lambda.ts
import serverlessExpress from '@vendia/serverless-express';
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

let cachedHandler: any;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const app = await createApp(AppModule, {
    lazy: true,
    database: {
      connections: {
        master: { writerUri: process.env.MONGO_URI! },
      },
    },
  });
  await app.init();
  cachedHandler = serverlessExpress({
    app: app.getHttpAdapter().getInstance(),
  });
  return cachedHandler;
}

export const handler = async (event: any, context: any) => {
  const app = await bootstrap();
  return app(event, context);
};
```

Cấu hình Lambda:
- Memory: tối thiểu 1024 MB (DI container ngốn bộ nhớ)
- Timeout: 30s (bao gồm cold start + xử lý request)
- Provisioned concurrency: cân nhắc cho endpoint nhạy cảm về latency

### Google Cloud Run (Serverless Container)

Cloud Run với `min-instances >= 1` là lựa chọn serverless tốt nhất cho nestjs-boot — tránh cold start trong khi vẫn scale về zero chi phí khi idle:

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: my-api
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "10"
    spec:
      containerConcurrency: 80
      containers:
        - image: gcr.io/my-project/my-api:latest
          ports:
            - containerPort: 3000
          resources:
            limits:
              memory: 512Mi
              cpu: "1"
```

### Azure Functions

```ts
// src/azure-entry.ts
import { AzureHttpAdapter } from '@nestjs/azure-func-http';
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

export default AzureHttpAdapter.handle(async () => {
  const app = await createApp(AppModule, {
    lazy: true,
  });
  await app.init();
  return app;
});
```

### Module Cần Tắt Cho Serverless

| Module | Lý do tắt | Cách tắt |
|--------|-----------|----------|
| `HealthModule` | Không có process chạy liên tục để health-check | Bỏ `health` khỏi `BootOptions` |
| `ShutdownModule` | Platform quản lý lifecycle | Bỏ `shutdown` khỏi `BootOptions` |
| `PrometheusModule` | Không có endpoint `/metrics` để scrape | Bỏ `observability.prometheus` |
| `BullMQ` worker | Không có process liên tục để consume queue | Không đăng ký queue processor |
| Cron job | Không có process liên tục để scheduling | Dùng cloud-native scheduler (EventBridge, Cloud Scheduler) |

### Connection Pooling Trong Serverless

Các serverless function không chia sẻ gì. Mỗi cold start tạo connection mới. Dùng database tối ưu cho serverless:

- **MongoDB Atlas Serverless** — auto-scaling, không giới hạn connection cố định
- **Upstash Redis** — Redis dựa trên HTTP, không cần kết nối TCP liên tục
- **PlanetScale / Neon** — serverless Postgres với connection pooling tích hợp

Với MongoDB thông thường, giảm pool size để tránh cạn connection:

```ts
const app = await createApp(AppModule, {
  lazy: true,
  database: {
    connections: {
      master: {
        writerUri: process.env.MONGO_URI!,
        options: {
          maxPoolSize: 2,   // tối thiểu — mỗi function instance = ít query
          minPoolSize: 0,   // cho phép teardown hoàn toàn
          maxIdleTimeMS: 10_000,
        },
      },
    },
  },
});
```

### Giới Hạn

Các tính năng **không hoạt động** trong serverless:

| Tính năng | Lý do |
|-----------|-------|
| WebSocket (`WebSocketModule`) | Yêu cầu kết nối TCP liên tục |
| BullMQ worker | Yêu cầu process chạy liên tục để consume job |
| CQRS event-sourcing projection | Read model phải rebuild mỗi cold start |
| Cron/scheduled task | Không có process liên tục |
| Prometheus metrics scraping | Không có endpoint `/metrics` giữa các invocation |
| In-memory session store | State bị mất giữa các invocation |

---

## Bảng So Sánh

| Tính năng | Stateless | Stateful | Serverless |
|-----------|-----------|----------|------------|
| **Scaling** | Horizontal (thêm replica) | Vertical + sticky session | Tự động theo request |
| **WebSocket** | Qua Redis adapter | Trực tiếp (gắn với replica) | Không hỗ trợ |
| **Chi phí** | Dự đoán được (replica cố định) | Dự đoán được (replica cố định) | Trả theo invocation |
| **Cold start** | N/A (luôn warm) | N/A (luôn warm) | 200–1500 ms |
| **Session store** | Redis (chia sẻ) | In-memory hoặc Redis | Chỉ external |
| **Connection pooling** | Tiêu chuẩn | Lập kế hoạch theo replica | Tối thiểu (1–2 mỗi instance) |
| **CQRS projection** | Persist vào DB | In-memory (nhanh) | Không thực tế |
| **Multi-tenancy** | Row/schema isolation | Row/schema/database isolation | Chỉ row/schema |
| **Health check** | Bắt buộc | Bắt buộc | Không áp dụng |
| **Graceful shutdown** | `ShutdownModule` | `ShutdownModule` (drain lâu hơn) | Platform quản lý |
| **Độ phức tạp** | Thấp | Trung bình–Cao | Trung bình |
| **Phù hợp cho** | REST API, microservice | App real-time, caching nặng | Traffic thưa, tối ưu chi phí |

---

## Framework Ra Quyết Định

Dùng flowchart sau để chọn chế độ triển khai:

```
Bắt đầu
  │
  ├─ Bạn cần WebSocket / real-time?
  │   ├─ Có + có thể dùng Redis adapter → Stateless
  │   ├─ Có + cần kết nối trực tiếp → Stateful
  │   └─ Không ↓
  │
  ├─ Traffic thưa (< 1 req/phút trung bình)?
  │   ├─ Có + cold start < 2s chấp nhận được → Serverless
  │   └─ Không ↓
  │
  ├─ Cần in-memory state (CQRS projection, local cache)?
  │   ├─ Có → Stateful
  │   └─ Không ↓
  │
  ├─ Cần database-level tenant isolation?
  │   ├─ Có → Stateful
  │   └─ Không ↓
  │
  └─ Mặc định → Stateless
```

### Khuyến Nghị Nhanh

| Use case | Chế độ khuyến nghị |
|----------|-------------------|
| REST API microservice | Stateless |
| GraphQL API | Stateless |
| Chat / thông báo real-time | Stateful (hoặc Stateless + Redis adapter) |
| Event-sourced domain service | Stateful |
| SaaS với DB riêng mỗi tenant | Stateful |
| Webhook receiver (traffic thấp) | Serverless (ưu tiên Cloud Run) |
| Scheduled job trigger | Serverless |
| Tool nội bộ / admin API | Stateless (một replica là đủ) |

---

## Đọc Thêm

- [Health Check và Graceful Shutdown](./health-shutdown.md)
- [WebSocket](./websocket.md)
- [CQRS & Event Sourcing](./cqrs-event-sourcing.md)
- [Multi-Tenancy](./multi-tenancy.md)
- [Cold Start & Serverless Considerations](./serverless-considerations.md)
- [Production Checklist](./production-checklist.md)
