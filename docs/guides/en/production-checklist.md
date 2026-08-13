# Production Readiness Checklist

> **TL;DR** — Pre-deploy checklist covering security (JWT secrets, algorithm pinning, rate limiting), database (replica sets, indexes), cache (Redis persistence), health probes, graceful shutdown, observability, resilience, payments, Docker, and environment config.

Use this checklist before every production deployment of a nestjs-boot service.
Each item includes a brief explanation of why it matters.

---

## Security

- [ ] **JWT secret >= 32 characters** — Short secrets are brute-forceable. Generate with
  `openssl rand -base64 48`. Set via `auth.jwt.secret` (env: `JWT_SECRET`).

- [ ] **JWT algorithm pinned** — Set `auth.jwt.signOptions.algorithm` explicitly (e.g., `'HS256'`).
  Without this, an attacker who controls the token header can switch to `'none'`.

- [ ] **Separate `resetSecret`** — Use `auth.jwt.resetSecret` for password-reset / email-verification
  tokens. If it shares the main secret, a leaked reset token becomes a session token.

- [ ] **Rate limiting on auth endpoints** — `/auth/login`, `/auth/refresh` should have
  stricter rate limits than other endpoints. See `docs/guides/auth-rate-limiting.md`.

- [ ] **Docker image non-root user** — Dockerfile runs as `USER node` (not root).
  Root in container = root on host if container escape occurs.
  Generated `Dockerfile` uses `USER node` by default.

- [ ] **Secrets not in env files** — `.env` files are gitignored. Inject secrets via:
  - K8s: `Secret` + `envFrom.secretRef`
  - Docker: `--env-file` (never baked into image)
  - CI/CD: GitHub Secrets / GitLab CI Variables
  - Production: HashiCorp Vault or AWS Secrets Manager with a custom `ConfigService` adapter.

- [ ] **Storage path traversal protection** — The `LocalAdapter` uses `safePath()` to reject
  keys containing `../`. If you build custom download endpoints, always resolve paths against
  the upload directory and verify the result stays within bounds.

---

## Database

- [ ] **Replica set enabled** — Mongoose transactions require a replica set (even single-node:
  `mongod --replSet rs0`). Without it, `session.startTransaction()` throws at runtime.

- [ ] **Connection pooling tuned** — Set `database.connections.*.options.maxPoolSize` (default: 100).
  Too low = connection starvation under load. Too high = MongoDB OOM. Start with 20-50 per pod.

- [ ] **Read replicas configured** — For read-heavy services, set `readerUri` on connections.
  Reads auto-route to the replica; writes always go to the primary.

- [ ] **Indexes created** — Run migration/index scripts before deploying. Missing indexes =
  slow queries under production load that don't show up in dev.

- [ ] **Backup strategy for MongoDB** — Periodic `mongodump` or Atlas scheduled snapshots.
  Test restore before go-live, not during an incident.

---

## Cache

- [ ] **Redis persistence configured** — Enable AOF or RDB in Redis config. Without persistence,
  a Redis restart loses all cached data and sessions, causing a thundering herd to your DB.

- [ ] **Redis `maxmemory-policy` set** — Default is `noeviction` (rejects writes when full).
  For cache use-cases, prefer `allkeys-lru`. Add to Redis config or docker-compose.

- [ ] **L1 eviction understood** — The in-memory L1 cache uses an LRU with a fixed max size.
  Set `cache.defaultTtl` (default: 300s) appropriately. Too long = stale data; too short =
  L1 miss rate defeats the purpose of two layers.

---

## Health Checks & Probes

- [ ] **Health endpoint responding** — `curl http://localhost:3000/health` returns `{"status":"ok"}`.
  Required for K8s liveness/readiness probes. Configure via `health: { path: '/health' }`.

- [ ] **K8s probes configured** — `livenessProbe` + `readinessProbe` both point to `/health`.
  Readiness probe removes pod from LB during rolling deploys. Generated `k8s/deployment.yaml`
  includes these by default.
  ```yaml
  livenessProbe:
    httpGet: { path: /health, port: 3000 }
    initialDelaySeconds: 15
    periodSeconds: 10
  readinessProbe:
    httpGet: { path: /health, port: 3000 }
    initialDelaySeconds: 5
    periodSeconds: 5
  ```

- [ ] **K8s preStop hook set** — Gives iptables time to stop routing before SIGTERM arrives
  (prevents 502s at deploy time). Generated `k8s/deployment.yaml` includes this by default.
  ```yaml
  lifecycle:
    preStop:
      exec:
        command: ["sh", "-c", "sleep 5"]
  ```

---

## Graceful Shutdown

- [ ] **Shutdown module enabled** — Set `shutdown: {}` in BootOptions (defaults: timeout 30s,
  drain strategy `'drain'`, signals `['SIGTERM', 'SIGINT']`).

- [ ] **Drain strategy is `'drain'`** — The default waits for in-flight requests to complete.
  Never use `'immediate'` in production unless you accept dropped requests.

- [ ] **InFlightTracker active** — ShutdownModule uses `InFlightTracker` to count in-flight
  requests. Health endpoint returns 503 once shutdown begins, causing K8s to stop routing.

- [ ] **Shutdown tested end-to-end** — Send SIGTERM to a running instance and verify:
  1. `/health` returns 503 immediately
  2. In-flight requests complete before process exits
  3. Process exits within `shutdown.timeout` (default: 30s)

---

## Observability

- [ ] **Structured logging (JSON, not pretty)** — Set `NODE_ENV=production` or
  `logging: { prettyPrint: false }`. Pretty-printed logs waste bytes and break log aggregators
  (Datadog, Loki, CloudWatch).

- [ ] **Correlation IDs propagating** — Every log line has `correlationId` field and outbound
  HTTP calls forward `X-Correlation-Id` header. Configure via `correlation: {}`.

- [ ] **Metrics endpoint configured** — Prometheus scrape endpoint at `/metrics` returning
  process + HTTP metrics. Configure via `metrics: { path: '/metrics' }`.

- [ ] **OTel tracing configured** — Set `tracing: { exporter: 'otlp', endpoint: '...' }`.
  Use `sampleRate: 0.1` in production (1.0 = trace every request = storage explosion).

- [ ] **Error monitoring wired** — Connect Sentry/Datadog via `monitoring.errorReporter`:
  ```ts
  monitoring: {
    errorReporter: (error, context) => Sentry.captureException(error, { extra: context }),
  }
  ```

---

## Resilience

- [ ] **Circuit breaker defaults reviewed** — Defaults: 5 failures to open, 30s reset timeout,
  1 request in half-open. Adjust `resilience.circuitBreaker` per downstream SLA.

- [ ] **Retry policies configured** — Default: 3 attempts, exponential backoff, 1s base delay,
  10s max delay. Set `retryOn` predicate to avoid retrying non-idempotent failures.

- [ ] **Timeout set** — Default: 30s via `resilience.timeout.default`. Reduce for user-facing
  APIs (5-10s). Gateway timeouts should exceed this value.

---

## Payments

- [ ] **Webhook signatures verified** — `webhooks.providers.stripe.secret` and
  `webhooks.providers.paypal.secret` must be production signing secrets.
  Never skip signature verification in production.

- [ ] **Idempotency cache bounded** — `IdempotencyGuard` uses an in-memory Map capped at
  10,000 entries with TTL-based eviction. For high-throughput payment endpoints, swap the
  `IDEMPOTENCY_CACHE` provider for Redis-backed storage.

---

## Docker & Deployment

- [ ] **Multi-stage Dockerfile** — Build stage installs dev deps + compiles; production stage
  copies only `dist/` + `node_modules` (production). Cuts image size 3-5x.

- [ ] **Image tag is not `latest`** — Use a SHA or semver tag for rollback support.
  Example: `myservice:a1b2c3d` (git SHA).

- [ ] **Resource limits set** — K8s `resources.limits` and `resources.requests` both defined.
  Generated `k8s/deployment.yaml` sets `128Mi/256Mi` memory and `100m/500m` CPU.

- [ ] **HPA configured** — `HorizontalPodAutoscaler` scales pods on CPU >= 70% and
  memory >= 80%. Generated `k8s/hpa.yaml` includes this by default.

---

## Environment

- [ ] **`.env` files not in image** — `.env` is for local dev only. `.env.production` overrides
  `.env` when `NODE_ENV=production` (loaded by `createApp`'s `loadEnvFiles()`).

- [ ] **Secrets in Vault/cloud** — For production, use HashiCorp Vault, AWS Secrets Manager,
  or GCP Secret Manager. Inject via env vars or a custom config adapter, not `.env` files.

---

## Post-Deploy Smoke Test

Run these after every production deploy:

```bash
# 1. Health check
curl -sf http://YOUR_SERVICE/health | jq .

# 2. Metrics endpoint (if enabled)
curl -sf http://YOUR_SERVICE/metrics | head -20

# 3. Auth endpoint (if JWT enabled) — expect 401
curl -sf -o /dev/null -w "%{http_code}" http://YOUR_SERVICE/auth/profile

# 4. Readiness probe simulation
curl -sf http://YOUR_SERVICE/health  # expect 200 within 10s of deploy
```
