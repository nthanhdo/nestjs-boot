# Container Deployment Guide

Deploy your nestjs-boot application as a container: build the image, push to a registry, pull and run with load balancing, and scale with orchestrators.

## The Flow

```
 Code  ──►  Build Image  ──►  Push to Registry  ──►  Pull & Run
              (Dockerfile)      (GHCR/ECR/GAR)       (Compose/K8s/ECS)
                                                          │
                                                     Load Balancer
                                                     (Nginx/ALB/Ingress)
                                                          │
                                              ┌───────────┼───────────┐
                                              ▼           ▼           ▼
                                          Replica 1   Replica 2   Replica 3
                                              │           │           │
                                              └─────┬─────┘           │
                                                    ▼                 ▼
                                                /health  ◄──  HPA / Auto-scaling
                                                /metrics ◄──  Prometheus
```

**Prerequisites:** Docker 24+, a container registry account, and a nestjs-boot project generated with the CLI.

---

## 1. Build the Image

### Dockerfile Explained

The generated `Dockerfile` uses a multi-stage build:

```dockerfile
# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./

# Install production deps separately for layer caching
RUN npm ci --only=production && cp -R node_modules /prod_modules

# Install all deps (including dev) for build
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine
WORKDIR /app

# Copy only production node_modules
COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json .

# Run as non-root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
```

Key design decisions:

| Feature | Why |
|---------|-----|
| **Multi-stage** | Final image has zero dev dependencies, ~120MB vs ~800MB |
| **`USER node`** | Non-root. Never run containers as root in production |
| **Separate prod modules** | `npm ci --only=production` is cached independently from full install |
| **Built-in HEALTHCHECK** | Docker and Compose use this automatically; K8s uses its own probes |
| **Alpine base** | Minimal attack surface, smallest image size |

### Build Command

```bash
# Tag with git SHA — unique and traceable
docker build -t myapp:sha-$(git rev-parse --short HEAD) .
```

### .dockerignore

Ensure your `.dockerignore` excludes unnecessary files:

```
node_modules
dist
.git
.env*
*.md
coverage
.vscode
```

### Local Testing

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e MONGO_URI=mongodb://host.docker.internal:27017/myapp \
  myapp:sha-abc123

# Verify
curl http://localhost:3000/health
```

---

## 2. Push to Registry

### Tag Strategy

| Tag | When to Use | Example |
|-----|------------|---------|
| `sha-<commit>` | Every deploy | `myapp:sha-a1b2c3d` |
| `v1.2.3` | Releases | `myapp:v1.2.3` |
| `main` | Branch tracking | `myapp:main` |
| ~~`latest`~~ | **Never in production** | Ambiguous, causes drift |

### GHCR (GitHub Container Registry)

Zero config when using GitHub Actions. The CI template pushes automatically:

```bash
# Manual push
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
docker tag myapp:sha-abc123 ghcr.io/myorg/myapp:sha-abc123
docker push ghcr.io/myorg/myapp:sha-abc123
```

### AWS ECR

Provision the registry with the included Terraform:

```bash
cd terraform/aws
terraform apply -target=aws_ecr_repository.app
```

This creates a repository with scan-on-push enabled and a lifecycle policy keeping the last 10 images.

```bash
# Authenticate
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Push
docker tag myapp:sha-abc123 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:sha-abc123
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:sha-abc123
```

### GCP Artifact Registry

Provision with Terraform:

```bash
cd terraform/gcp
terraform apply -target=google_artifact_registry_repository.app
```

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
docker tag myapp:sha-abc123 us-central1-docker.pkg.dev/my-project/myapp-repo/app:sha-abc123
docker push us-central1-docker.pkg.dev/my-project/myapp-repo/app:sha-abc123
```

### Using `scripts/build-push.sh`

The project includes a convenience script:

```bash
# Uses DOCKER_REGISTRY (default: ghcr.io) and DOCKER_IMAGE (default: dir name)
./scripts/build-push.sh              # tags with current git SHA
./scripts/build-push.sh v1.2.3       # tags with explicit version

# Override registry
DOCKER_REGISTRY=123456789.dkr.ecr.us-east-1.amazonaws.com \
DOCKER_IMAGE=myapp \
  ./scripts/build-push.sh sha-abc123
```

---

## 3. Deploy with Docker Compose + Nginx

This is the simplest production setup: Nginx load-balances across multiple app replicas, all managed by Docker Compose.

### docker-compose.prod.yml

The generated production Compose file pulls a pre-built image (does not build locally):

```yaml
services:
  app:
    image: ${DOCKER_REGISTRY:-ghcr.io}/${DOCKER_IMAGE:-org/app}:${DOCKER_TAG:-latest}
    restart: unless-stopped
    deploy:
      replicas: ${APP_REPLICAS:-3}
      resources:
        limits:
          cpus: '1'
          memory: 512M
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first     # New container starts before old one stops
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env.production
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 15s
      timeout: 3s
      retries: 3
      start_period: 30s
    networks:
      - backend

  nginx:
    image: nginx:alpine
    ports:
      - "${PUBLIC_PORT:-80}:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      app:
        condition: service_healthy
    networks:
      - backend
    restart: unless-stopped

networks:
  backend:
    driver: bridge
```

### Nginx Configuration

The generated `nginx.conf` uses `least_conn` load balancing and supports WebSocket upgrades:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream app {
        least_conn;
        server app:3000;
        # Docker Compose DNS resolves to all replicas
    }

    server {
        listen 80;

        location / {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Correlation-Id $request_id;

            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;
        }

        location /health {
            proxy_pass http://app;
            access_log off;
        }

        location /metrics {
            proxy_pass http://app;
            allow 10.0.0.0/8;       # Internal only
            allow 172.16.0.0/12;
            deny all;
        }
    }
}
```

Key points:
- **`least_conn`** distributes to the replica with fewest active connections
- **WebSocket** headers (`Upgrade`, `Connection`) allow WebSocket passthrough
- **`/metrics`** is restricted to internal networks
- **`X-Correlation-Id`** uses nginx's `$request_id` for distributed tracing

### Environment Variables

Create `.env.production` on the server (never commit this file):

```bash
MONGO_URI=mongodb://admin:secretpass@mongodb:27017/myapp?authSource=admin
REDIS_URL=redis://:secretpass@redis:6379
JWT_SECRET=your-production-secret
```

### Deploy and Rolling Update

Use the included `scripts/deploy.sh`:

```bash
# Deploy with specific tag
DOCKER_IMAGE=ghcr.io/myorg/myapp ./scripts/deploy.sh sha-abc123

# Or manually
export DOCKER_TAG=sha-abc123
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d --no-recreate --scale app=3
```

The `update_config` with `order: start-first` ensures new containers are healthy before old ones stop, providing zero-downtime deploys.

### Scaling

```bash
# Scale to 5 replicas
docker compose -f docker-compose.prod.yml up -d --scale app=5

# Scale down
docker compose -f docker-compose.prod.yml up -d --scale app=2
```

---

## 4. Deploy with Kubernetes

### Apply Manifests

The `k8s/` directory contains five manifests. Apply them in order:

```bash
# Replace template variables first (or use Helm/Kustomize)
export APP_NAME=myapp
export APP_TAG=sha-abc123
export APP_ORG=myorg

# Apply
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml
```

### Deployment — Rolling Update Strategy

```yaml
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Add 1 new pod before removing old
      maxUnavailable: 0    # Never reduce below desired count
```

With `maxUnavailable: 0`, Kubernetes guarantees the full replica count is always serving traffic.

### Readiness and Liveness Probes

```yaml
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

- **Readiness** controls traffic routing. Fails during shutdown (503) to drain connections.
- **Liveness** restarts the pod if the app is stuck. Higher initial delay to avoid killing slow starts.

### HPA (Horizontal Pod Autoscaler)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
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

### Zero-Downtime Deploy Flow

```
1. kubectl apply -f deployment.yaml (new image tag)
2. K8s creates new pod(s) with maxSurge=1
3. New pod passes readinessProbe → receives traffic
4. K8s sends SIGTERM to old pod
5. preStop hook: sleep 5  (lets kube-proxy update routes)
6. App's ShutdownService marks shuttingDownFlag=true
7. /health returns 503 → readiness fails → removed from endpoints
8. In-flight requests drain → server.close() → pod terminated
```

### Trigger a Deploy

```bash
# Update image tag
kubectl set image deployment/myapp myapp=ghcr.io/myorg/myapp:sha-abc123

# Watch rollout
kubectl rollout status deployment/myapp

# Rollback if needed
kubectl rollout undo deployment/myapp
```

---

## 5. Deploy with Cloud (Terraform)

### AWS: ECR + ECS Fargate + ALB

The `terraform/aws/` directory provisions the full stack:

```bash
cd terraform/aws
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

terraform init
terraform plan
terraform apply
```

Resources created:
- **ECR** — container registry with scan-on-push and lifecycle policy (10 images)
- **ECS Fargate** — serverless containers, no EC2 to manage
- **ALB** — application load balancer with `/health` health checks
- **Auto-scaling** — target tracking on CPU (70%) and memory (80%)
- **CloudWatch Logs** — 90-day retention in prod, 14-day in staging

For full details, see the [Infrastructure as Code guide](./infrastructure-as-code.md).

### GCP: Artifact Registry + Cloud Run

```bash
cd terraform/gcp
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply
```

Resources created:
- **Artifact Registry** — Docker repository with cleanup policy (10 recent images)
- **Cloud Run v2** — auto-scaling (min/max instances), startup + liveness probes
- **VPC connector** — private access to Memorystore Redis
- **Public IAM** — unauthenticated access for public APIs

Cloud Run uses startup probes on `/health` with a 10s initial delay and liveness probes every 30s.

---

## 6. Health Checks and Graceful Shutdown

nestjs-boot ships `HealthModule` and `ShutdownModule` that work together for zero-downtime deploys.

### Health Endpoint Behavior

| State | Response | Effect |
|-------|----------|--------|
| Running normally | `200 OK` + indicator details | Receives traffic |
| Shutting down | `503 Service Unavailable` | Removed from LB/endpoints |
| DB/Redis down | `503` + failing indicator | Marked unhealthy |

The health controller checks `ShutdownService.isShuttingDownNow()` and throws `ServiceUnavailableException` during shutdown, causing readiness probes to fail immediately.

### Shutdown Sequence

```
SIGTERM received
    │
    ▼
ShutdownService.shuttingDownFlag = true
    │
    ▼
/health returns 503 (readiness fails)
    │
    ▼
LB / K8s removes pod from rotation
    │
    ▼
Phase 1: beforeShutdown hook (custom cleanup)
    │
    ▼
Phase 2: server.close() — stop new connections, drain in-flight
    │
    ▼
Phase 2b: closeAllConnections() — drain keep-alive (Node 18.2+)
    │
    ▼
Process exits
```

### K8s preStop Hook Alignment

The deployment template includes a `preStop` hook:

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 5"]
terminationGracePeriodSeconds: 35
```

Timing breakdown:
- **preStop sleep 5s** — allows kube-proxy to update iptables rules before the app starts rejecting
- **App shutdown** — up to 30s for `beforeShutdown` hook + connection drain
- **terminationGracePeriodSeconds: 35** — must exceed preStop (5s) + app shutdown timeout

The `BOOT_PRESTOP_DELAY_MS` env var (default 5000) lets you tune the delay without changing the Dockerfile.

### Docker Compose Integration

Docker Compose uses the Dockerfile's built-in `HEALTHCHECK`. The `start_period: 30s` prevents false restarts during cold boot. The `depends_on: condition: service_healthy` on the nginx service ensures the LB only starts routing after the app is ready.

---

## 7. CI/CD: Automated Pipeline

### GitHub Actions

The generated `.github/workflows/ci.yml` runs: lint, test (sharded), build, and Docker push:

```yaml
docker:
  needs: [test]
  if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
  permissions:
    contents: read
    packages: write
  steps:
    - uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - uses: docker/metadata-action@v5
      id: meta
      with:
        images: ghcr.io/${{ github.repository }}
        tags: |
          type=sha
          type=ref,event=branch
          type=semver,pattern={{version}}
          type=semver,pattern={{major}}.{{minor}}

    - uses: docker/build-push-action@v5
      with:
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

The `docker/metadata-action` generates tags automatically: SHA for every push to main, semver for git tags.

To deploy after push, add a step that SSHes to your server or triggers `kubectl set image`. See the [Deployment Strategies guide](./deployment-strategies.md) for patterns.

### GitLab CI

The generated `.gitlab-ci.yml` pushes to GitLab Container Registry:

```yaml
docker:
  stage: docker
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" "$CI_REGISTRY"
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_COMMIT_TAG =~ /^v.*/
```

### Tag-Triggered Releases

Both CI templates automatically build and push when you create a git tag:

```bash
git tag v1.2.3
git push origin v1.2.3
# CI builds and pushes myapp:v1.2.3 + myapp:1.2
```

---

## 8. Monitoring After Deploy

### Health Endpoint Verification

```bash
# Immediate check
curl -f http://your-app.example.com/health

# Continuous monitoring
watch -n 5 'curl -s http://your-app.example.com/health | jq .'
```

### Prometheus Metrics

The observability stack (`docker-compose.observability.yml`) includes Prometheus pre-configured to scrape `/metrics`:

```bash
docker compose -f docker-compose.observability.yml up -d

# Endpoints:
# Prometheus  → http://localhost:9090
# Grafana     → http://localhost:3030  (admin / admin)
# Jaeger      → http://localhost:16686
```

The nginx config restricts `/metrics` to internal networks (`10.0.0.0/8`, `172.16.0.0/12`).

### Log Aggregation

The observability stack includes Loki + Promtail for centralized logs. On ECS, logs go to CloudWatch automatically. On K8s, use the Loki stack or your preferred log aggregator.

### Key Metrics to Watch

| Metric | Alert Threshold |
|--------|----------------|
| HTTP error rate (5xx) | > 1% over 5min |
| Response latency p99 | > 2s |
| Health check failures | > 2 consecutive |
| Memory usage | > 80% of limit |
| CPU utilization | > 70% sustained |

See the [Observability guide](./observability.md) and [Alerts guide](./alerts.md) for detailed setup.

---

## 9. Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs <container-id>
docker compose -f docker-compose.prod.yml logs app

# Common causes:
# 1. Missing env vars → "Cannot read property of undefined"
# 2. Wrong NODE_ENV → dev dependencies not installed
# 3. Port conflict → "EADDRINUSE"
```

**Fix:** Verify `.env.production` has all required variables. Check `docker compose config` to see resolved values.

### Health Check Failing

```bash
# Test from inside the container
docker exec <container-id> wget -qO- http://localhost:3000/health

# Common causes:
# 1. App not ready yet → increase start_period
# 2. DB not reachable → check network/DNS
# 3. Shutdown in progress → check logs for "shutting down"
```

### Connection Refused (DB/Redis)

```bash
# Verify network connectivity
docker exec <app-container> wget -qO- http://mongodb:27017 2>&1

# Common causes:
# 1. Services on different Docker networks → use same network in compose
# 2. Host.docker.internal not available → use service names
# 3. Auth required → check MONGO_INITDB_ROOT_USERNAME matches MONGO_URI
```

### Image Pull Errors

```bash
# GHCR: verify token has read:packages scope
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# ECR: token expires every 12 hours
aws ecr get-login-password | docker login --username AWS --password-stdin <ecr-url>

# K8s: create image pull secret
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=USERNAME \
  --docker-password=$GITHUB_TOKEN
```

### K8s Pod CrashLoopBackOff

```bash
kubectl describe pod <pod-name>    # Check Events section
kubectl logs <pod-name> --previous # Logs from crashed instance

# Common causes:
# 1. OOMKilled → increase memory limit in deployment.yaml
# 2. Liveness probe too aggressive → increase initialDelaySeconds
# 3. Missing ConfigMap → apply configmap.yaml first
```

---

## Related Guides

- [Health & Shutdown](./health-shutdown.md) — deep dive into health indicators and shutdown hooks
- [Load Balancing](./load-balancing.md) — strategies and sticky sessions
- [Deployment Strategies](./deployment-strategies.md) — blue-green, canary, rolling
- [Infrastructure as Code](./infrastructure-as-code.md) — full Terraform walkthrough
- [Observability](./observability.md) — metrics, tracing, logging
- [Production Checklist](./production-checklist.md) — pre-launch verification
