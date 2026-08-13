# Deployment Strategies

> **TL;DR** — nestjs-boot runs best as a long-lived container. This guide compares three deployment modes — stateless, stateful, and serverless — with configuration examples, trade-offs, and a decision framework to help you pick the right one.

---

## Table of Contents

1. [Stateless Deployment](#stateless-deployment)
2. [Stateful Deployment](#stateful-deployment)
3. [Serverless Deployment](#serverless-deployment)
4. [Comparison Table](#comparison-table)
5. [Decision Framework](#decision-framework)

---

## Stateless Deployment

Stateless is the default and recommended mode. Every replica is identical and disposable — no request affinity, no local state.

### What Makes a nestjs-boot App Stateless

A nestjs-boot app is stateless when:

- **Database** is external (MongoDB Atlas, self-hosted replica set)
- **Cache** is external (Redis, not in-memory)
- **Sessions** are stored in Redis (not default in-memory store)
- **File uploads** go to object storage (S3, GCS), not local disk
- **No WebSocket** or WebSocket uses Redis adapter (pub/sub across replicas)

The key principle: any replica can handle any request. Kill one, spin up another — users notice nothing.

### Configuration for Stateless

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
    store: 'redis',  // NOT 'memory'
    secret: process.env.SESSION_SECRET!,
  },
  health: { path: '/health' },
  shutdown: { gracefulTimeoutMs: 15_000 },
});
```

What to **enable**: `HealthModule`, `ShutdownModule`, external cache, external session store.

What to **disable/avoid**: in-memory session store, local file storage, singleton state that holds request data.

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
                command: ["sh", "-c", "sleep 5"]  # drain LB connections
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

### Rolling Updates with Zero Downtime

nestjs-boot's `ShutdownModule` handles this automatically:

1. K8s sends `SIGTERM` to the old pod
2. `ShutdownModule` marks health endpoint as `503` (readiness probe fails)
3. K8s stops routing new traffic to the pod
4. In-flight requests drain (up to `gracefulTimeoutMs`)
5. Database and Redis connections close
6. Process exits

The `preStop` sleep ensures the load balancer has time to remove the pod from its pool before shutdown begins.

### Session Management via Redis

Never use the default in-memory session store in a multi-replica setup — sessions will be lost when requests hit a different replica.

```ts
const app = await createApp(AppModule, {
  session: {
    store: 'redis',
    secret: process.env.SESSION_SECRET!,
    ttl: 86400,  // 24 hours
  },
  cache: {
    redis: { url: process.env.REDIS_URL! },
  },
});
```

With Redis-backed sessions, any replica can resume any user's session.

---

## Stateful Deployment

Some workloads require local state. This is more complex to operate but necessary in specific scenarios.

### When You Need Stateful

- **WebSocket connections** — clients maintain persistent TCP connections to a specific replica
- **In-memory caches** — hot data that must be sub-millisecond (Redis round-trip too slow)
- **Event sourcing aggregates** — CQRS read models rebuilt in memory from event streams
- **Long-running computations** — background jobs that accumulate intermediate state
- **Connection-heavy workloads** — each replica manages its own database connection pool

### Sticky Sessions with Kubernetes

When clients must always reach the same replica (e.g., WebSocket without Redis adapter):

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
      timeoutSeconds: 10800  # 3 hours
  ports:
    - port: 80
      targetPort: 3000
```

With Nginx Ingress:

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

Use `StatefulSet` when replicas have distinct identities (e.g., each replica owns a shard of data):

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
            # Pod names: my-api-0, my-api-1, my-api-2
            # Use POD_NAME to determine shard ownership
```

Use `Deployment` with sticky sessions for most stateful web apps. Use `StatefulSet` when:
- Each replica needs stable network identity (`my-api-0`, `my-api-1`)
- Each replica needs dedicated persistent storage (`volumeClaimTemplates`)
- Ordered startup/shutdown matters

### CQRS Read Models as Local State

With nestjs-boot's CQRS module, read-model projections can be maintained in memory for fast queries:

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

In a stateful deployment, this in-memory projection survives across requests on the same replica. In stateless, you would persist projections to the database instead.

### Database Connection Pooling Across Replicas

Each replica maintains its own connection pool. Plan pool sizes accordingly:

```
Total connections = replicas x poolSize
```

If MongoDB allows 500 connections and you run 5 replicas, set `poolSize` to at most 100:

```ts
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: process.env.MONGO_URI!,
        options: {
          maxPoolSize: 100,  // 5 replicas x 100 = 500 total
          minPoolSize: 10,
        },
      },
    },
  },
});
```

### Multi-Tenancy with Database Isolation

In stateful mode with database-level tenant isolation, each tenant gets a separate MongoDB connection:

```ts
import { TenancyModule } from 'nestjs-boot/tenancy';

@Module({
  imports: [
    TenancyModule.register({
      strategy: 'header',
      headerName: 'X-Tenant-ID',
      isolation: 'database',  // separate DB per tenant
    }),
  ],
})
export class AppModule {}
```

Each tenant connection is cached in memory on the replica that first served that tenant. This is inherently stateful — the connection cache lives in-process. With database isolation, plan for:

- Connection count = `replicas x active_tenants x minPoolSize`
- Memory per connection: ~1–5 MB depending on driver and query patterns
- Connection warm-up time on first request per tenant per replica

See the [Multi-Tenancy guide](./multi-tenancy.md) for full configuration reference.

### Configuration Changes for Stateful

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
  // WebSocket without Redis adapter = stateful (connections pinned to replica)
  // With Redis adapter = can scale horizontally (hybrid)
  health: { path: '/health' },
  shutdown: {
    gracefulTimeoutMs: 30_000,  // longer drain for WebSocket/long-running jobs
  },
});
```

---

## Serverless Deployment

> See also: [Cold Start & Serverless Considerations](./serverless-considerations.md) for detailed cold start analysis.

nestjs-boot is designed for long-running services. Serverless is possible but comes with trade-offs.

### Cold Start Optimization

Enable `lazy` mode to defer database and cache connections until first use:

```ts
const app = await createApp(AppModule, {
  lazy: true,  // connections established on first request, not at boot
  database: {
    connections: {
      master: { writerUri: process.env.MONGO_URI! },
    },
  },
  cache: { redis: { url: process.env.REDIS_URL! } },
});
```

Cold start without `lazy`: 500–1500 ms. With `lazy`: 200–600 ms.

Use `LazyModuleLoader` for heavy modules that are not needed on every request (see serverless-considerations guide).

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

Lambda configuration:
- Memory: 1024 MB minimum (DI container is memory-hungry)
- Timeout: 30s (covers cold start + request processing)
- Provisioned concurrency: consider for latency-sensitive endpoints

### Google Cloud Run (Serverless Container)

Cloud Run with `min-instances >= 1` is the best serverless option for nestjs-boot — it avoids cold starts while still scaling to zero cost during idle:

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

### What to Disable for Serverless

| Module | Why disable | How |
|--------|-------------|-----|
| `HealthModule` | No long-running process to health-check | Omit `health` from `BootOptions` |
| `ShutdownModule` | Platform manages lifecycle | Omit `shutdown` from `BootOptions` |
| `PrometheusModule` | No `/metrics` endpoint to scrape | Omit `observability.prometheus` |
| `BullMQ` workers | No persistent process for queue consumers | Do not register queue processors |
| Cron jobs | No persistent process for scheduling | Use cloud-native schedulers (EventBridge, Cloud Scheduler) |

### Connection Pooling in Serverless

Serverless functions share nothing. Each cold start creates new connections. Use serverless-optimized databases:

- **MongoDB Atlas Serverless** — auto-scaling, no fixed connection limit
- **Upstash Redis** — HTTP-based Redis, no persistent TCP connection needed
- **PlanetScale / Neon** — serverless Postgres with connection pooling built in

For standard MongoDB, reduce pool size to avoid exhausting connections:

```ts
const app = await createApp(AppModule, {
  lazy: true,
  database: {
    connections: {
      master: {
        writerUri: process.env.MONGO_URI!,
        options: {
          maxPoolSize: 2,   // minimal — one function instance = few queries
          minPoolSize: 0,   // allow full teardown
          maxIdleTimeMS: 10_000,
        },
      },
    },
  },
});
```

### Limitations

Features that **do not work** in serverless:

| Feature | Reason |
|---------|--------|
| WebSocket (`WebSocketModule`) | Requires persistent TCP connection |
| BullMQ workers | Requires long-running process to consume jobs |
| CQRS event-sourcing projections | Read models rebuild on every cold start |
| Cron/scheduled tasks | No persistent process |
| Prometheus metrics scraping | No `/metrics` endpoint between invocations |
| In-memory session store | State lost between invocations |

---

## Comparison Table

| Feature | Stateless | Stateful | Serverless |
|---------|-----------|----------|------------|
| **Scaling** | Horizontal (add replicas) | Vertical + sticky sessions | Auto per-request |
| **WebSocket** | Via Redis adapter | Direct (pinned to replica) | Not supported |
| **Cost model** | Predictable (fixed replicas) | Predictable (fixed replicas) | Pay-per-invocation |
| **Cold start** | N/A (always warm) | N/A (always warm) | 200–1500 ms |
| **Session store** | Redis (shared) | In-memory or Redis | External only |
| **Connection pooling** | Standard | Plan per-replica | Minimal (1–2 per instance) |
| **CQRS projections** | Persisted to DB | In-memory (fast) | Not practical |
| **Multi-tenancy** | Row/schema isolation | Row/schema/database isolation | Row/schema only |
| **Health checks** | Required | Required | Not applicable |
| **Graceful shutdown** | `ShutdownModule` | `ShutdownModule` (longer drain) | Platform-managed |
| **Complexity** | Low | Medium–High | Medium |
| **Best for** | REST APIs, microservices | Real-time apps, heavy caching | Sporadic traffic, cost optimization |

---

## Decision Framework

Use this flowchart to pick your deployment mode:

```
Start
  │
  ├─ Do you need WebSocket / real-time?
  │   ├─ Yes + can use Redis adapter → Stateless
  │   ├─ Yes + need direct connections → Stateful
  │   └─ No ↓
  │
  ├─ Is traffic sporadic (< 1 req/min average)?
  │   ├─ Yes + cold start < 2s acceptable → Serverless
  │   └─ No ↓
  │
  ├─ Do you need in-memory state (CQRS projections, local cache)?
  │   ├─ Yes → Stateful
  │   └─ No ↓
  │
  ├─ Do you need database-level tenant isolation?
  │   ├─ Yes → Stateful
  │   └─ No ↓
  │
  └─ Default → Stateless
```

### Quick Recommendations

| Use case | Recommended mode |
|----------|-----------------|
| REST API microservice | Stateless |
| GraphQL API | Stateless |
| Real-time chat / notifications | Stateful (or Stateless + Redis adapter) |
| Event-sourced domain service | Stateful |
| SaaS with DB-per-tenant | Stateful |
| Webhook receiver (low traffic) | Serverless (Cloud Run preferred) |
| Scheduled job trigger | Serverless |
| Internal tool / admin API | Stateless (single replica is fine) |

---

## Further Reading

- [Health Checks and Graceful Shutdown](./health-shutdown.md)
- [WebSocket](./websocket.md)
- [CQRS & Event Sourcing](./cqrs-event-sourcing.md)
- [Multi-Tenancy](./multi-tenancy.md)
- [Cold Start & Serverless Considerations](./serverless-considerations.md)
- [Production Checklist](./production-checklist.md)
