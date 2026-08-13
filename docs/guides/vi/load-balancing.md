# Load Balancing với nestjs-boot

Hướng dẫn này bao gồm cách chạy ứng dụng nestjs-boot phía sau load balancer với horizontal scaling, health probe, graceful shutdown, shared state, và auto-scaling.

## Mục lục

1. [Kiến trúc mở rộng](#kiến-trúc-mở-rộng)
2. [Health Check cho Load Balancer](#health-check-cho-load-balancer)
3. [Graceful Shutdown & Connection Draining](#graceful-shutdown--connection-draining)
4. [Session Affinity vs Stateless](#session-affinity-vs-stateless)
5. [WebSocket với nhiều instance](#websocket-với-nhiều-instance)
6. [Correlation ID xuyên suốt các instance](#correlation-id-xuyên-suốt-các-instance)
7. [Service Discovery](#service-discovery)
8. [Ví dụ cấu hình Load Balancer](#ví-dụ-cấu-hình-load-balancer)
9. [Auto-Scaling](#auto-scaling)
10. [Các nguyên tắc tốt nhất](#các-nguyên-tắc-tốt-nhất)

---

## Kiến trúc mở rộng

### Horizontal Scaling

nestjs-boot được thiết kế sẵn cho horizontal scaling. Chạy N instance giống nhau phía sau load balancer, mỗi instance kết nối chung database và Redis:

```
                    ┌─────────────┐
                    │   Load      │
                    │  Balancer   │
                    └──────┬──────┘
               ┌───────────┼───────────┐
               ▼           ▼           ▼
          ┌────────┐  ┌────────┐  ┌────────┐
          │ App:1  │  │ App:2  │  │ App:3  │
          └───┬────┘  └───┬────┘  └───┬────┘
              │           │           │
         ┌────┴───────────┴───────────┴────┐
         │          Redis (L2 cache)       │
         │          MongoDB / Postgres     │
         └─────────────────────────────────┘
```

### Sticky Sessions vs Stateless

| Cách tiếp cận | Ưu điểm | Nhược điểm |
|----------------|----------|------------|
| **Stateless** (khuyến nghị) | Mở rộng đơn giản, instance nào cũng xử lý được | Cần externalize state (Redis) |
| **Sticky sessions** | Không cần shared state | Tải không đều, mất session khi failover |

nestjs-boot ưu tiên thiết kế stateless. `CacheModule` với Redis L2 và `WebSocketModule` với Redis adapter giải quyết hai lý do phổ biến nhất khiến đội ngũ cần sticky sessions.

---

## Health Check cho Load Balancer

`HealthModule` cung cấp endpoint GET để load balancer dùng làm health probe. Module tự phát hiện các service đã cấu hình (database, Redis) và kiểm tra chúng.

### Cấu hình

```typescript
import { BootModule } from 'nestjs-boot';

BootModule.register({
  health: {
    path: '/health',  // mặc định
  },
  database: { /* ... */ },
  cache: {
    redis: { url: 'redis://localhost:6379' },
  },
});
```

Endpoint `/health` trả về:
- **200** kèm chi tiết indicator khi tất cả check pass
- **503** khi bất kỳ indicator nào fail HOẶC khi graceful shutdown đang diễn ra

### Readiness vs Liveness trong Kubernetes

Dùng **cùng một endpoint** cho cả hai probe nhưng với timing khác nhau:

```yaml
# templates/k8s/deployment.yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 20
  timeoutSeconds: 3

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3
```

**Hành vi chính:** Khi `ShutdownService` đang hoạt động và nhận được tín hiệu shutdown, health endpoint trả về **503** ngay lập tức. Readiness probe fail, pod bị loại khỏi Service endpoint trước khi in-flight connection được drain.

### AWS ALB Health Check

Terraform template kèm theo (`templates/terraform/aws/alb.tf`) cấu hình health check trên target group:

```hcl
health_check {
  path                = "/health"
  port                = "traffic-port"
  healthy_threshold   = 2
  unhealthy_threshold = 3
  timeout             = 5
  interval            = 30
  matcher             = "200"
}
```

---

## Graceful Shutdown & Connection Draining

`ShutdownModule` điều phối zero-downtime deployment bằng cách đảm bảo các request đang xử lý hoàn thành trước khi process thoát.

### Cách hoạt động

```
SIGTERM nhận được
    │
    ▼
shuttingDownFlag = true  ──► /health trả về 503
    │                         (LB ngừng route)
    ▼
Phase 1: beforeShutdown hook (cleanup tùy chỉnh)
    │
    ▼
Phase 2: server.close() — ngừng nhận connection mới
    │     drain in-flight request (strategy: 'drain')
    │     closeAllConnections() — drain keep-alive (Node 18.2+)
    │
    ▼
Shutdown hoàn tất
```

### Cấu hình

```typescript
BootModule.register({
  shutdown: {
    timeout: 25000,            // thời gian chờ tối đa trước force-exit (mặc định: 30000)
    signals: ['SIGTERM', 'SIGINT'],  // mặc định
    drainStrategy: 'drain',    // 'drain' (chờ) hoặc 'immediate' (bỏ)
    beforeShutdown: async () => {
      // Đóng database connection, flush queue, v.v.
    },
  },
});
```

### InFlightTracker

`InFlightTracker` đếm số HTTP request đang xử lý. Khi shutdown, drain strategy chờ counter về zero:

```typescript
import { InFlightTracker } from 'nestjs-boot';

@Injectable()
export class MyService {
  constructor(private readonly tracker: InFlightTracker) {}

  getActiveRequests(): number {
    return this.tracker.getCount();
  }
}
```

### Kubernetes preStop Hook

Kubernetes gửi SIGTERM tới pod, nhưng iptables propagation mất 1-5 giây. Hook `preStop` tạo delay để load balancer loại pod khỏi endpoint trước khi app bắt đầu shutdown:

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 5"]
```

**Phân bổ thời gian** (với `terminationGracePeriodSeconds: 30` mặc định):

| Giai đoạn | Thời lượng |
|-----------|-----------|
| preStop sleep | 5s |
| App drain (shutdown.timeout) | tối đa 25s |
| Buffer trước SIGKILL | ~0s |

Đặt `terminationGracePeriodSeconds: 35` để có 5s buffer thoải mái:

```yaml
spec:
  terminationGracePeriodSeconds: 35
```

Delay preStop có thể cấu hình qua biến môi trường:

```bash
BOOT_PRESTOP_DELAY_MS=5000  # mặc định
```

nestjs-boot tự phát hiện Kubernetes (qua biến môi trường `KUBERNETES_SERVICE_HOST`) và log cấu hình preStop khi khởi động.

---

## Session Affinity vs Stateless

### Khi nào Sticky Sessions chấp nhận được

- Ứng dụng legacy dùng in-memory session store
- WebSocket connection không có Redis adapter (chỉ single-instance)
- Môi trường prototype / development

### Redis Cache giúp Stateless như thế nào

Với `CacheModule` cấu hình Redis L2, tất cả instance chia sẻ chung cache:

```typescript
BootModule.register({
  cache: {
    redis: { url: 'redis://localhost:6379' },
    defaultTtl: 300,
  },
});
```

Multi-layer cache (L1 in-memory + L2 Redis) nghĩa là:
- **Session data** lưu trong Redis truy cập được từ bất kỳ instance nào
- **Cached computation** được chia sẻ, giảm tính toán trùng lặp
- **L1 cho tốc độ**, L2 cho tính nhất quán giữa các instance

Request nào vào instance nào cũng nhận được cùng dữ liệu. Không cần sticky sessions.

---

## WebSocket với nhiều instance

Mặc định, Socket.IO dùng in-memory adapter. Event emit trên một instance không được nhận bởi client kết nối tới instance khác. `WebSocketModule` giải quyết vấn đề này bằng Redis adapter.

### Cấu hình

```typescript
BootModule.register({
  websocket: {
    redis: { url: 'redis://localhost:6379' },
  },
});
```

Khi `redis.url` được cấu hình, `createRedisAdapterFactory` tạo `@socket.io/redis-adapter` sử dụng ioredis pub/sub client. Event được broadcast tới tất cả instance qua Redis pub/sub.

### Package cần thiết

```bash
npm install @socket.io/redis-adapter ioredis
```

Nếu các package này chưa cài, nestjs-boot log cảnh báo và fallback về in-memory adapter (chỉ single-instance).

### Cách hoạt động

```
Client A ──► Instance 1 ──emit──► Redis pub/sub ──► Instance 2 ──► Client B
                                                 ──► Instance 3 ──► Client C
```

Tất cả client nhận được event bất kể đang kết nối tới instance nào.

---

## Correlation ID xuyên suốt các instance

Khi request đi qua nhiều service (hoặc cùng service phía sau load balancer), bạn cần trace nó. `CorrelationModule` cung cấp `CorrelationIdMiddleware`:

1. Đọc `X-Correlation-Id` từ request header (hoặc tạo UUID mới)
2. Gán vào response header
3. Lưu vào `AsyncLocalStorage` trong suốt request lifecycle
4. Tùy chọn propagate W3C `traceparent` header cho tích hợp OpenTelemetry

### Cấu hình

```typescript
BootModule.register({
  correlation: {
    header: 'X-Correlation-Id',  // mặc định
    generator: () => randomUUID(),  // mặc định
  },
});
```

### Tracing xuyên instance

Khi Instance A gọi Instance B (qua transport client), truyền correlation ID:

```typescript
import { correlationStorage } from 'nestjs-boot';

// Correlation ID tự động có sẵn trong AsyncLocalStorage
const store = correlationStorage.getStore();
const correlationId = store?.correlationId;

// Truyền khi gọi HTTP tới service khác
const response = await httpService.get('http://service-b/api', {
  headers: { 'X-Correlation-Id': correlationId },
});
```

Điều này đảm bảo tất cả log entry xuyên suốt các instance chia sẻ cùng correlation ID cho một request.

---

## Service Discovery

Interface `ServiceDiscoveryHook` cho phép resolve URL động cho transport client. Thay vì hardcode URL, resolve tại runtime từ Consul, Kubernetes DNS, etcd, hoặc biến môi trường.

### Interface

```typescript
interface ServiceDiscoveryHook {
  resolve(): Promise<{ url: string }>;
}
```

### Ví dụ

**Resolve từ biến môi trường:**

```typescript
import { fromResolverFn } from 'nestjs-boot';

TransportModule.register({
  clients: {
    ORDER_SERVICE: {
      transport: 'grpc',
      options: { package: 'order', protoPath: './order.proto' },
      discover: fromResolverFn(async () => ({
        url: process.env.ORDER_SERVICE_URL!,
      })),
    },
  },
});
```

**Resolve qua Kubernetes DNS:**

```typescript
class K8sDiscovery implements ServiceDiscoveryHook {
  constructor(private readonly serviceName: string) {}
  async resolve(): Promise<{ url: string }> {
    // K8s internal DNS: <service>.<namespace>.svc.cluster.local
    return { url: `http://${this.serviceName}.default.svc.cluster.local:3000` };
  }
}
```

**Resolve qua Consul:**

```typescript
class ConsulDiscovery implements ServiceDiscoveryHook {
  constructor(private readonly consul: ConsulClient, private readonly svc: string) {}
  async resolve(): Promise<{ url: string }> {
    const address = await this.consul.resolve(this.svc);
    return { url: `http://${address}` };
  }
}
```

### Chính sách Re-Resolution

Kiểm soát khi nào `resolve()` được gọi lại sau lần khởi tạo:

```typescript
{
  discover: new ConsulDiscovery(consul, 'order-service'),
  discoveryPolicy: {
    retryOnFailure: true,  // re-resolve khi connection fail
    ttlMs: 60_000,         // re-resolve chủ động mỗi 60s
  },
}
```

---

## Ví dụ cấu hình Load Balancer

### Nginx (Reverse Proxy)

```nginx
upstream nestjs_app {
    least_conn;  # hoặc ip_hash cho sticky sessions
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://nestjs_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Correlation-Id $request_id;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://nestjs_app/health;
        proxy_connect_timeout 2s;
        proxy_read_timeout 3s;
    }
}
```

Để hỗ trợ WebSocket, các header `Upgrade` và `Connection` ở trên là bắt buộc.

### AWS ALB (Terraform)

nestjs-boot kèm theo Terraform template sẵn dùng tại `templates/terraform/aws/alb.tf`:

```hcl
resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "app" {
  name        = "${local.name_prefix}-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
}
```

Nếu cần sticky sessions trên ALB:

```hcl
resource "aws_lb_target_group" "app" {
  # ... giống trên ...

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }
}
```

### Kubernetes Ingress + Service

Sử dụng các template trong `templates/k8s/`:

**Service** (`templates/k8s/service.yaml`):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
spec:
  type: ClusterIP
  ports:
    - port: 3000
      targetPort: 3000
      protocol: TCP
  selector:
    app: my-app
```

**Ingress** (`templates/k8s/ingress.yaml`):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - "my-app.example.com"
      secretName: my-app-tls
  rules:
    - host: "my-app.example.com"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app
                port:
                  number: 3000
```

### Docker Compose (Nhiều Replica)

```yaml
version: "3.8"

services:
  app:
    image: my-nestjs-app:latest
    deploy:
      replicas: 3
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=mongodb://mongo:27017/mydb
    depends_on:
      - redis
      - mongo

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
```

Docker Compose `deploy.replicas` hoạt động với `docker compose up --scale app=3` hoặc Swarm mode. Với Compose thuần không Swarm, định nghĩa service riêng hoặc dùng flag `--scale`.

---

## Auto-Scaling

### Kubernetes HPA

HPA template kèm theo (`templates/k8s/hpa.yaml`) scale dựa trên CPU và memory:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Custom Metrics Scaling

Scale dựa trên metric riêng của ứng dụng (ví dụ: request queue depth, in-flight request):

```yaml
metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_in_flight
      target:
        type: AverageValue
        averageValue: 100
```

Cần metrics adapter (ví dụ Prometheus Adapter) để expose custom metric tới HPA controller. Bạn có thể expose `InFlightTracker.getCount()` qua Prometheus endpoint.

### Hành vi Scale-Down

Ngăn flapping bằng cách cấu hình stabilization cho scale-down:

```yaml
behavior:
  scaleDown:
    stabilizationWindowSeconds: 300
    policies:
      - type: Percent
        value: 10
        periodSeconds: 60
  scaleUp:
    stabilizationWindowSeconds: 0
    policies:
      - type: Percent
        value: 100
        periodSeconds: 15
```

---

## Các nguyên tắc tốt nhất

### 1. Thiết kế Stateless

- Lưu session trong Redis, không dùng in-memory
- Dùng `CacheModule` với Redis L2 cho shared cache
- Không bao giờ lưu file upload trên local filesystem (dùng `FileStorageModule` với S3/GCS)

### 2. Externalize mọi State

| Loại State | Nơi lưu trữ |
|-----------|-------------|
| Sessions | Redis (`CacheModule` L2) |
| Cache | Redis L2 (kết hợp L1 in-memory cho tốc độ) |
| File upload | S3 / GCS (`FileStorageModule`) |
| WebSocket event | Redis pub/sub (`WebSocketModule` adapter) |
| Job queue | Redis / RabbitMQ (`QueueModule`) |

### 3. Cấu hình Health Check

- Đặt readiness probe `initialDelaySeconds` đủ cao cho thời gian khởi động app
- Giữ `periodSeconds` hợp lý (10-30s) tránh tải không cần thiết
- Đồng bộ health endpoint path giữa cấu hình app và LB/probe
- Health endpoint tự động trả 503 khi shutdown; không cần cấu hình thêm

### 4. Thời gian Graceful Shutdown

- Luôn dùng `drainStrategy: 'drain'` trong production
- Trong Kubernetes, luôn thêm `preStop: sleep 5` để cho phép iptables propagation
- Đặt `shutdown.timeout` = `terminationGracePeriodSeconds - preStop - 5s buffer`
- Ví dụ: 35s grace period - 5s preStop - 5s buffer = **25s drain timeout**

### 5. Propagation Correlation ID

- Luôn forward `X-Correlation-Id` khi gọi HTTP ra ngoài
- Ghi correlation ID trong log output để trace request xuyên instance
- Dùng W3C `traceparent` header khi tích hợp OpenTelemetry

### 6. Giám sát tình trạng Instance

- Theo dõi `InFlightTracker.getCount()` trên mỗi instance
- Alert khi instance không drain được trong thời gian timeout
- Giám sát kết nối Redis (cache và WebSocket adapter fail gracefully nhưng cần alert)

### 7. Số Replica tối thiểu

- Chạy ít nhất 2 replica trong production (`minReplicas: 2` trong HPA)
- Đảm bảo zero downtime khi rolling deployment: một pod drain trong khi pod khác phục vụ traffic
