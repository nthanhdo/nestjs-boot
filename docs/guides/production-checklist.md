# Production Readiness Checklist

Use this checklist before every production deployment of a nestjs-boot service.
Each item includes a brief explanation of why it matters.

---

## Health & Observability

- [ ] **Health endpoint responding** — `curl http://localhost:3000/health` returns `{"status":"ok"}`.
  Required for K8s liveness/readiness probes. Configure via `health: { path: '/health' }`.

- [ ] **Metrics endpoint configured** — Prometheus scrape endpoint at `/metrics` returning
  process + HTTP metrics. Configure via `metrics: { path: '/metrics' }`.

- [ ] **Structured logging (JSON, not pretty)** — Set `NODE_ENV=production` or
  `logging: { prettyPrint: false }`. Pretty-printed logs waste bytes and break log aggregators
  (Datadog, Loki, CloudWatch).

- [ ] **Correlation IDs propagating** — Every log line has `correlationId` field and outbound
  HTTP calls forward `X-Correlation-Id` header. Configure via `correlation: {}`.

---

## Reliability

- [ ] **Graceful shutdown tested** — Send SIGTERM to a running instance and verify:
  1. `/health` returns 503 immediately (K8s readiness probe fails → pod removed from LB)
  2. In-flight requests complete before process exits
  3. Process exits cleanly within `shutdown.timeout` (default: 30s)

- [ ] **K8s probes configured** — `livenessProbe` + `readinessProbe` both point to `/health`.
  `readinessProbe` removes pod from LB during rolling deploys. Generated `k8s/deployment.yaml`
  includes these by default.

- [ ] **K8s preStop hook set** — `lifecycle.preStop.exec.command: ["sh", "-c", "sleep 5"]`
  gives iptables time to stop routing before SIGTERM arrives (prevents 502s at deploy time).
  Generated `k8s/deployment.yaml` includes this by default.

---

## Security

- [ ] **Docker image non-root user** — Dockerfile runs as `USER node` (not root).
  Root in container = root on host if container escape occurs.
  Generated `Dockerfile` uses `USER node` by default.

- [ ] **Secrets not in env files** — `.env` files are gitignored. Inject secrets via:
  - K8s: `Secret` + `envFrom.secretRef`
  - Docker: `--env-file` (never baked into image)
  - CI/CD: GitHub Secrets / GitLab CI Variables

- [ ] **Rate limiting on auth endpoints** — `/auth/login`, `/auth/refresh` should have
  stricter rate limits than other endpoints. See `docs/guides/auth-rate-limiting.md`.

---

## Performance

- [ ] **Resource limits set** — K8s `resources.limits` and `resources.requests` both defined.
  Without limits, one noisy pod can starve others. Generated `k8s/deployment.yaml` sets
  `128Mi/256Mi` memory and `100m/500m` CPU — adjust for your service.

- [ ] **HPA configured** — `HorizontalPodAutoscaler` scales pods on CPU ≥ 70% and
  memory ≥ 80%. Generated `k8s/hpa.yaml` includes this by default.

- [ ] **Database indexes created** — Run your migration/index scripts before deploying.
  Missing indexes = slow queries under production load.

- [ ] **Redis `maxmemory-policy` set** — Default is `noeviction` (rejects writes when full).
  For cache use-cases, prefer `allkeys-lru`. Add to Redis config or docker-compose.

---

## Data & Backups

- [ ] **Backup strategy for MongoDB** — Periodic `mongodump` or Atlas scheduled snapshots.
  Test restore before go-live, not during an incident.

---

## Error Monitoring

- [ ] **Error monitoring configured (Sentry/Datadog)** — Wire via `monitoring.errorReporter`:
  ```ts
  monitoring: {
    errorReporter: (error, context) => Sentry.captureException(error, { extra: context }),
  }
  ```
  Without this, unhandled exceptions are logged but never alerted.

---

## Deployment

- [ ] **Image tag is not `latest`** — Use a SHA or semver tag so K8s can detect new images
  and rollback is possible. Example: `myservice:a1b2c3d` (git SHA).
  See `k8s/deployment.yaml` — replace `{{name}}:latest` with `{{name}}:${IMAGE_TAG}`.

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
