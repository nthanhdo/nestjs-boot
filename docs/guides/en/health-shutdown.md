# Health Checks and Graceful Shutdown

> **TL;DR** — `HealthModule` auto-detects your database and Redis and registers health indicators at `GET /health`. `ShutdownModule` orchestrates ordered teardown: health returns 503, in-flight requests drain, then the process exits. Designed for Kubernetes rolling deployments with zero downtime.

nestjs-boot provides auto-detecting health checks and an ordered graceful shutdown system designed for Kubernetes rolling deployments.

## HealthModule

`HealthModule` auto-detects configured infrastructure and registers the appropriate health indicators. Built on `@nestjs/terminus`.

```ts
import { createApp } from 'nestjs-boot';

const app = await createApp(AppModule, {
  database: {
    connections: {
      master: { writerUri: 'mongodb://localhost:27017/myapp' },
    },
  },
  cache: { redis: { url: 'redis://localhost:6379' } },
  health: { path: '/health' },  // default: '/health'
});
```

The module inspects your `BootOptions`:
- `options.database` present: registers `DatabaseHealthIndicator` (pings MongoDB)
- `options.cache.redis` present: registers `RedisHealthIndicator` (pings Redis via the injected `MultiCacheService`)
- Neither configured: the endpoint still works, it just reports no indicators

The health controller path is configurable via `options.health.path`.

## Health Endpoint Behavior

`GET /health` runs all registered indicators via Terminus `HealthCheckService`:

```json
{
  "status": "ok",
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

During graceful shutdown, the endpoint returns **503 Service Unavailable** immediately. This is intentional: it causes Kubernetes readiness probes to fail so the pod is removed from the service endpoint before in-flight connections are drained.

## ShutdownModule

Registers the graceful shutdown system. Add it to your module imports:

```ts
import { ShutdownModule } from 'nestjs-boot/shutdown';

ShutdownModule.register({
  timeout: 25000,           // max wait before force-exit (default: 30000)
  signals: ['SIGTERM', 'SIGINT'],  // default
  drainStrategy: 'drain',  // 'drain' | 'immediate' (default: 'drain')
  beforeShutdown: async () => {
    console.log('Flushing buffers...');
  },
})
```

The module is registered globally, so `ShutdownService` and `InFlightTracker` are available throughout the app.

## Shutdown Sequence

When a signal is received, `ShutdownService` orchestrates an ordered teardown:

1. **Signal received** -- `SignalHandler` catches SIGTERM/SIGINT, sets the shutting-down flag. Duplicate signals are ignored.
2. **Health endpoint returns 503** -- K8s readiness probe fails, pod is removed from load balancer.
3. **Phase 1: beforeShutdown hook** -- Your custom cleanup runs (flush queues, close connections). Errors are caught and logged but do not abort shutdown.
4. **Phase 2: HTTP server close** -- Stops accepting new connections. If `drainStrategy: 'drain'` and there are in-flight requests, waits for them to complete. Keep-alive connections are drained via `closeAllConnections()` (Node 18.2+).
5. **Force-exit safety net** -- If shutdown exceeds `timeout`, `process.exit(1)` fires.

## InFlightTracker

Tracks the count of currently in-flight HTTP requests. Used by the shutdown system to decide when draining is complete.

```ts
import { InFlightTracker } from 'nestjs-boot/shutdown';

@Injectable()
export class RequestTrackingInterceptor implements NestInterceptor {
  constructor(private readonly tracker: InFlightTracker) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    this.tracker.increment();
    return next.handle().pipe(
      finalize(() => this.tracker.decrement()),
    );
  }
}
```

The counter never goes below zero. Access the current count via `tracker.getCount()`.

## SignalHandler

Registers OS signal handlers and enforces single-execution (duplicate signals during shutdown are ignored). Configures a force-exit timer via `setTimeout` with `unref()` so it does not keep the event loop alive.

## DrainStrategy

| Strategy | Behavior |
|----------|----------|
| `'drain'` (default) | Wait for in-flight requests to finish before closing the HTTP server. Zero-downtime deployments. |
| `'immediate'` | Close the server immediately, dropping in-flight requests. Faster but lossy. |

## Kubernetes Integration

The shutdown system auto-detects Kubernetes by checking `KUBERNETES_SERVICE_HOST` in the environment. When detected, it logs the preStop delay configuration.

Recommended `deployment.yaml`:

```yaml
spec:
  terminationGracePeriodSeconds: 35
  containers:
    - lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]
      readinessProbe:
        httpGet:
          path: /health
          port: 3000
        periodSeconds: 5
        failureThreshold: 1
```

Matching nestjs-boot config:

```ts
ShutdownModule.register({
  timeout: 25000,        // 5s buffer before K8s SIGKILL at 35s
  drainStrategy: 'drain',
})
```

The timeline: K8s calls preStop (sleep 5s) giving iptables time to propagate, then sends SIGTERM. The app has 25s to drain, with a 5s buffer before the 35s `terminationGracePeriodSeconds` triggers SIGKILL.

Configure the preStop delay via the `BOOT_PRESTOP_DELAY_MS` environment variable (default: 5000).

## Best Practices

- Always use `drainStrategy: 'drain'` in production for zero-downtime deployments
- Set `timeout` to `terminationGracePeriodSeconds - preStopDelay - 5s` (buffer)
- Register `InFlightTracker` in a global interceptor so the drain count is accurate
- Use the `beforeShutdown` hook to flush write buffers, close WebSocket connections, or deregister from service discovery
- Test shutdown locally: `kill -TERM <pid>` and verify logs show the phased sequence
