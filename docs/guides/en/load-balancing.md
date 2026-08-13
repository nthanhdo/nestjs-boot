# Load Balancing with nestjs-boot

This guide covers running nestjs-boot applications behind a load balancer with horizontal scaling, health probes, graceful shutdown, shared state, and auto-scaling.

## Table of Contents

1. [Architecture Patterns](#architecture-patterns)
2. [Health Checks for Load Balancers](#health-checks-for-load-balancers)
3. [Graceful Shutdown & Connection Draining](#graceful-shutdown--connection-draining)
4. [Session Affinity vs Stateless](#session-affinity-vs-stateless)
5. [WebSocket with Multiple Instances](#websocket-with-multiple-instances)
6. [Correlation ID Across Instances](#correlation-id-across-instances)
7. [Service Discovery](#service-discovery)
8. [Load Balancer Configuration Examples](#load-balancer-configuration-examples)
9. [Auto-Scaling](#auto-scaling)
10. [Best Practices](#best-practices)

---

## Architecture Patterns

### Horizontal Scaling

nestjs-boot is designed for horizontal scaling out of the box. Run N identical instances behind a load balancer, each connecting to the same database and Redis:

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

| Approach | Pros | Cons |
|----------|------|------|
| **Stateless** (recommended) | Simple scaling, any instance handles any request | Requires externalized state (Redis) |
| **Sticky sessions** | No shared state needed | Uneven load, failover loses session |

nestjs-boot favors stateless design. The `CacheModule` with Redis L2 and `WebSocketModule` with Redis adapter handle the two most common reasons teams reach for sticky sessions.

---

## Health Checks for Load Balancers

The `HealthModule` provides a GET endpoint that load balancers use as a health probe. It auto-detects configured services (database, Redis) and checks them.

### Setup

```typescript
import { BootModule } from 'nestjs-boot';

BootModule.register({
  health: {
    path: '/health',  // default
  },
  database: { /* ... */ },
  cache: {
    redis: { url: 'redis://localhost:6379' },
  },
});
```

The `/health` endpoint returns:
- **200** with indicator details when all checks pass
- **503** when any indicator fails OR when a graceful shutdown is in progress

### Readiness vs Liveness in Kubernetes

Use the **same endpoint** for both probes but with different timing:

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

**Key behavior:** When `ShutdownService` is active and a shutdown signal is received, the health endpoint immediately returns **503**. This causes the readiness probe to fail, removing the pod from the Service endpoints before in-flight connections are drained.

### AWS ALB Health Check

The included Terraform template (`templates/terraform/aws/alb.tf`) configures health checks on the target group:

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

The `ShutdownModule` orchestrates zero-downtime deployments by ensuring in-flight requests complete before the process exits.

### How It Works

```
SIGTERM received
    │
    ▼
shuttingDownFlag = true  ──► /health returns 503
    │                         (LB stops routing)
    ▼
Phase 1: beforeShutdown hook (custom cleanup)
    │
    ▼
Phase 2: server.close() — stop accepting new connections
    │     drain in-flight requests (strategy: 'drain')
    │     closeAllConnections() — drain keep-alive (Node 18.2+)
    │
    ▼
Shutdown complete
```

### Configuration

```typescript
BootModule.register({
  shutdown: {
    timeout: 25000,            // max wait before force-exit (default: 30000)
    signals: ['SIGTERM', 'SIGINT'],  // default
    drainStrategy: 'drain',    // 'drain' (wait) or 'immediate' (drop)
    beforeShutdown: async () => {
      // Close database connections, flush queues, etc.
    },
  },
});
```

### InFlightTracker

The `InFlightTracker` service counts active HTTP requests. During shutdown, the drain strategy waits for this counter to reach zero:

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

Kubernetes sends SIGTERM to the pod, but iptables propagation takes 1-5 seconds. The `preStop` hook introduces a delay so the load balancer removes the pod from endpoints before the app starts shutting down:

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 5"]
```

**Timing budget** (with default `terminationGracePeriodSeconds: 30`):

| Phase | Duration |
|-------|----------|
| preStop sleep | 5s |
| App drain (shutdown.timeout) | 25s max |
| Buffer before SIGKILL | ~0s |

Set `terminationGracePeriodSeconds: 35` for a comfortable 5s buffer:

```yaml
spec:
  terminationGracePeriodSeconds: 35
```

The preStop delay is configurable via environment variable:

```bash
BOOT_PRESTOP_DELAY_MS=5000  # default
```

nestjs-boot auto-detects Kubernetes (via `KUBERNETES_SERVICE_HOST` env var) and logs the preStop configuration at startup.

---

## Session Affinity vs Stateless

### When Sticky Sessions Are Acceptable

- Legacy apps with in-memory session stores
- WebSocket connections without Redis adapter (single-instance only)
- Prototyping / development environments

### How Redis Cache Enables Stateless

With `CacheModule` configured with Redis L2, all instances share the same cache:

```typescript
BootModule.register({
  cache: {
    redis: { url: 'redis://localhost:6379' },
    defaultTtl: 300,
  },
});
```

This multi-layer cache (L1 in-memory + L2 Redis) means:
- **Session data** stored in Redis is accessible from any instance
- **Cached computations** are shared, reducing redundant work
- **L1 provides speed**, L2 provides consistency across instances

Any request can hit any instance and get the same data. No sticky sessions needed.

---

## WebSocket with Multiple Instances

By default, Socket.IO uses an in-memory adapter. This means events emitted on one instance are not received by clients connected to another instance. The `WebSocketModule` solves this with a Redis adapter.

### Setup

```typescript
BootModule.register({
  websocket: {
    redis: { url: 'redis://localhost:6379' },
  },
});
```

When `redis.url` is configured, `createRedisAdapterFactory` creates a `@socket.io/redis-adapter` backed by ioredis pub/sub clients. Events are broadcast across all instances via Redis pub/sub.

### Required Packages

```bash
npm install @socket.io/redis-adapter ioredis
```

If these packages are not installed, nestjs-boot logs a warning and falls back to the in-memory adapter (single-instance only).

### How It Works

```
Client A ──► Instance 1 ──emit──► Redis pub/sub ──► Instance 2 ──► Client B
                                                 ──► Instance 3 ──► Client C
```

All connected clients receive events regardless of which instance they are connected to.

---

## Correlation ID Across Instances

When a request passes through multiple services (or the same service behind a load balancer), you need to trace it. The `CorrelationModule` provides `CorrelationIdMiddleware` that:

1. Reads `X-Correlation-Id` from the incoming request header (or generates a new UUID)
2. Sets it on the response header
3. Stores it in `AsyncLocalStorage` for the request lifecycle
4. Optionally propagates W3C `traceparent` headers for OpenTelemetry integration

### Setup

```typescript
BootModule.register({
  correlation: {
    header: 'X-Correlation-Id',  // default
    generator: () => randomUUID(),  // default
  },
});
```

### Cross-Instance Tracing

When Instance A calls Instance B (via transport clients), pass the correlation ID:

```typescript
import { correlationStorage } from 'nestjs-boot';

// The correlation ID is automatically available in AsyncLocalStorage
const store = correlationStorage.getStore();
const correlationId = store?.correlationId;

// Pass it when making HTTP calls to other services
const response = await httpService.get('http://service-b/api', {
  headers: { 'X-Correlation-Id': correlationId },
});
```

This ensures all log entries across instances share the same correlation ID for a single user request.

---

## Service Discovery

The `ServiceDiscoveryHook` interface allows dynamic URL resolution for transport clients. Instead of hardcoding service URLs, resolve them at runtime from Consul, Kubernetes DNS, etcd, or environment variables.

### Interface

```typescript
interface ServiceDiscoveryHook {
  resolve(): Promise<{ url: string }>;
}
```

### Examples

**Environment variable resolution:**

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

**Kubernetes DNS resolution:**

```typescript
class K8sDiscovery implements ServiceDiscoveryHook {
  constructor(private readonly serviceName: string) {}
  async resolve(): Promise<{ url: string }> {
    // K8s internal DNS: <service>.<namespace>.svc.cluster.local
    return { url: `http://${this.serviceName}.default.svc.cluster.local:3000` };
  }
}
```

**Consul-based resolution:**

```typescript
class ConsulDiscovery implements ServiceDiscoveryHook {
  constructor(private readonly consul: ConsulClient, private readonly svc: string) {}
  async resolve(): Promise<{ url: string }> {
    const address = await this.consul.resolve(this.svc);
    return { url: `http://${address}` };
  }
}
```

### Re-Resolution Policy

Control when `resolve()` is called after initial startup:

```typescript
{
  discover: new ConsulDiscovery(consul, 'order-service'),
  discoveryPolicy: {
    retryOnFailure: true,  // re-resolve on connection failure
    ttlMs: 60_000,         // re-resolve every 60s proactively
  },
}
```

---

## Load Balancer Configuration Examples

### Nginx (Reverse Proxy)

```nginx
upstream nestjs_app {
    least_conn;  # or ip_hash for sticky sessions
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

    # Health check endpoint (used by upstream health checks)
    location /health {
        proxy_pass http://nestjs_app/health;
        proxy_connect_timeout 2s;
        proxy_read_timeout 3s;
    }
}
```

For WebSocket support, the `Upgrade` and `Connection` headers above are required.

### AWS ALB (Terraform)

nestjs-boot includes a ready-to-use Terraform template at `templates/terraform/aws/alb.tf`:

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

For sticky sessions on ALB (if needed):

```hcl
resource "aws_lb_target_group" "app" {
  # ... same as above ...

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }
}
```

### Kubernetes Ingress + Service

Use the templates in `templates/k8s/`:

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

### Docker Compose (Multiple Replicas)

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

Docker Compose `deploy.replicas` works with `docker compose up --scale app=3` or Swarm mode. For plain Compose without Swarm, define separate services or use the `--scale` flag.

---

## Auto-Scaling

### Kubernetes HPA

The included HPA template (`templates/k8s/hpa.yaml`) scales based on CPU and memory:

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

Scale based on application-specific metrics (e.g., request queue depth, in-flight requests):

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

This requires a metrics adapter (e.g., Prometheus Adapter) to expose custom metrics to the HPA controller. You can expose `InFlightTracker.getCount()` via a Prometheus endpoint.

### Scale-Down Behavior

Prevent flapping by configuring scale-down stabilization:

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

## Best Practices

### 1. Design for Statelessness

- Store sessions in Redis, not in-memory
- Use `CacheModule` with Redis L2 for shared cache
- Never store uploaded files on the local filesystem (use `FileStorageModule` with S3/GCS)

### 2. Externalize All State

| State Type | Where to Store |
|-----------|----------------|
| Sessions | Redis (`CacheModule` L2) |
| Cache | Redis L2 (with L1 in-memory for speed) |
| File uploads | S3 / GCS (`FileStorageModule`) |
| WebSocket events | Redis pub/sub (`WebSocketModule` adapter) |
| Job queues | Redis / RabbitMQ (`QueueModule`) |

### 3. Health Check Configuration

- Set readiness probe `initialDelaySeconds` high enough for app startup
- Keep `periodSeconds` reasonable (10-30s) to avoid unnecessary load
- Match the health endpoint path in your app config and LB/probe config
- The health endpoint returns 503 during shutdown automatically; no extra config needed

### 4. Graceful Shutdown Timing

- Always use `drainStrategy: 'drain'` in production
- In Kubernetes, always add `preStop: sleep 5` to allow iptables propagation
- Set `shutdown.timeout` to `terminationGracePeriodSeconds - preStop - 5s buffer`
- Example: 35s grace period - 5s preStop - 5s buffer = **25s drain timeout**

### 5. Correlation ID Propagation

- Always forward `X-Correlation-Id` when making outbound HTTP calls
- Include correlation ID in log output for cross-instance request tracing
- Use the W3C `traceparent` header when integrating with OpenTelemetry

### 6. Monitor Instance Health

- Track `InFlightTracker.getCount()` per instance
- Alert on instances that fail to drain within the timeout
- Monitor Redis connectivity (cache and WebSocket adapter failures degrade gracefully but should be alerted on)

### 7. Minimum Replica Count

- Run at least 2 replicas in production (`minReplicas: 2` in HPA)
- This ensures zero downtime during rolling deployments: one pod drains while the other serves traffic
