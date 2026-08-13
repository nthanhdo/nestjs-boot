# Huong dan Deploy Container

Deploy ung dung nestjs-boot duoi dang container: build image, push len registry, pull va chay voi load balancing, scale bang orchestrator.

## Tong quan luong deploy

```
 Code  ──►  Build Image  ──►  Push Registry  ──►  Pull & Run
              (Dockerfile)    (GHCR/ECR/GAR)     (Compose/K8s/ECS)
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

**Yeu cau:** Docker 24+, tai khoan container registry, va project nestjs-boot da tao bang CLI.

---

## 1. Build Image

### Giai thich Dockerfile

Dockerfile su dung multi-stage build:

```dockerfile
# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./

# Cai rieng production deps de tan dung layer cache
RUN npm ci --only=production && cp -R node_modules /prod_modules

# Cai tat ca deps (bao gom dev) de build
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine
WORKDIR /app

# Chi copy production node_modules
COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json .

# Chay voi user non-root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
```

Cac diem thiet ke quan trong:

| Tinh nang | Ly do |
|-----------|-------|
| **Multi-stage** | Image cuoi khong co dev dependencies, ~120MB thay vi ~800MB |
| **`USER node`** | Non-root. Khong bao gio chay container bang root trong production |
| **Tach prod modules** | `npm ci --only=production` duoc cache doc lap |
| **HEALTHCHECK tich hop** | Docker va Compose dung truc tiep; K8s dung probe rieng |
| **Alpine base** | Be mat tan cong toi thieu, kich thuoc image nho nhat |

### Lenh build

```bash
# Tag bang git SHA — duy nhat va truy vet duoc
docker build -t myapp:sha-$(git rev-parse --short HEAD) .
```

### .dockerignore

Dam bao `.dockerignore` loai tru cac file khong can thiet:

```
node_modules
dist
.git
.env*
*.md
coverage
.vscode
```

### Test local

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e MONGO_URI=mongodb://host.docker.internal:27017/myapp \
  myapp:sha-abc123

# Kiem tra
curl http://localhost:3000/health
```

---

## 2. Push len Registry

### Chien luoc tag

| Tag | Khi nao dung | Vi du |
|-----|-------------|-------|
| `sha-<commit>` | Moi lan deploy | `myapp:sha-a1b2c3d` |
| `v1.2.3` | Release | `myapp:v1.2.3` |
| `main` | Theo doi branch | `myapp:main` |
| ~~`latest`~~ | **Khong bao gio dung trong production** | Mo ho, gay lech phien ban |

### GHCR (GitHub Container Registry)

Khong can cau hinh khi dung GitHub Actions. CI template tu dong push:

```bash
# Push thu cong
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
docker tag myapp:sha-abc123 ghcr.io/myorg/myapp:sha-abc123
docker push ghcr.io/myorg/myapp:sha-abc123
```

### AWS ECR

Tao registry bang Terraform co san:

```bash
cd terraform/aws
terraform apply -target=aws_ecr_repository.app
```

Tao repository voi scan-on-push va lifecycle policy giu 10 image gan nhat.

```bash
# Xac thuc
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Push
docker tag myapp:sha-abc123 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:sha-abc123
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:sha-abc123
```

### GCP Artifact Registry

Tao bang Terraform:

```bash
cd terraform/gcp
terraform apply -target=google_artifact_registry_repository.app
```

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
docker tag myapp:sha-abc123 us-central1-docker.pkg.dev/my-project/myapp-repo/app:sha-abc123
docker push us-central1-docker.pkg.dev/my-project/myapp-repo/app:sha-abc123
```

### Dung `scripts/build-push.sh`

Project co san script tien ich:

```bash
# Dung DOCKER_REGISTRY (mac dinh: ghcr.io) va DOCKER_IMAGE (mac dinh: ten thu muc)
./scripts/build-push.sh              # tag bang git SHA hien tai
./scripts/build-push.sh v1.2.3       # tag voi version cu the

# Ghi de registry
DOCKER_REGISTRY=123456789.dkr.ecr.us-east-1.amazonaws.com \
DOCKER_IMAGE=myapp \
  ./scripts/build-push.sh sha-abc123
```

---

## 3. Deploy voi Docker Compose + Nginx

Day la setup production don gian nhat: Nginx can bang tai giua nhieu app replica, tat ca quan ly boi Docker Compose.

### docker-compose.prod.yml

File Compose production pull image da build san (khong build local):

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
        order: start-first     # Container moi khoi dong truoc khi container cu dung
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

### Cau hinh Nginx

`nginx.conf` dung `least_conn` load balancing va ho tro WebSocket:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream app {
        least_conn;
        server app:3000;
        # Docker Compose DNS phan giai den tat ca replica
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
            allow 10.0.0.0/8;       # Chi mang noi bo
            allow 172.16.0.0/12;
            deny all;
        }
    }
}
```

Cac diem chinh:
- **`least_conn`** phan phoi den replica co it ket noi nhat
- **WebSocket** headers (`Upgrade`, `Connection`) cho phep WebSocket di qua
- **`/metrics`** chi cho phep mang noi bo truy cap
- **`X-Correlation-Id`** dung `$request_id` cua nginx cho distributed tracing

### Bien moi truong

Tao `.env.production` tren server (khong bao gio commit file nay):

```bash
MONGO_URI=mongodb://admin:secretpass@mongodb:27017/myapp?authSource=admin
REDIS_URL=redis://:secretpass@redis:6379
JWT_SECRET=your-production-secret
```

### Deploy va Rolling Update

Dung script `scripts/deploy.sh` co san:

```bash
# Deploy voi tag cu the
DOCKER_IMAGE=ghcr.io/myorg/myapp ./scripts/deploy.sh sha-abc123

# Hoac thu cong
export DOCKER_TAG=sha-abc123
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d --no-recreate --scale app=3
```

`update_config` voi `order: start-first` dam bao container moi healthy truoc khi container cu dung, deploy khong downtime.

### Scale

```bash
# Scale len 5 replica
docker compose -f docker-compose.prod.yml up -d --scale app=5

# Scale xuong
docker compose -f docker-compose.prod.yml up -d --scale app=2
```

---

## 4. Deploy voi Kubernetes

### Ap dung Manifest

Thu muc `k8s/` chua 5 manifest. Ap dung theo thu tu:

```bash
# Thay the bien template truoc (hoac dung Helm/Kustomize)
export APP_NAME=myapp
export APP_TAG=sha-abc123
export APP_ORG=myorg

# Ap dung
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml
```

### Deployment — Chien luoc Rolling Update

```yaml
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Them 1 pod moi truoc khi xoa pod cu
      maxUnavailable: 0    # Khong bao gio giam duoi so luong mong muon
```

Voi `maxUnavailable: 0`, Kubernetes dam bao luon du so replica phuc vu traffic.

### Readiness va Liveness Probe

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

- **Readiness** dieu khien dinh tuyen traffic. Fail khi shutdown (503) de drain ket noi.
- **Liveness** khoi dong lai pod neu app bi treo. Delay ban dau cao hon de tranh kill pod khoi dong cham.

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

### Luong deploy khong downtime

```
1. kubectl apply -f deployment.yaml (tag image moi)
2. K8s tao pod moi voi maxSurge=1
3. Pod moi pass readinessProbe → nhan traffic
4. K8s gui SIGTERM den pod cu
5. preStop hook: sleep 5  (cho kube-proxy cap nhat route)
6. ShutdownService cua app dat shuttingDownFlag=true
7. /health tra ve 503 → readiness fail → xoa khoi endpoints
8. Request dang xu ly drain xong → server.close() → pod bi terminate
```

### Thuc hien deploy

```bash
# Cap nhat image tag
kubectl set image deployment/myapp myapp=ghcr.io/myorg/myapp:sha-abc123

# Theo doi rollout
kubectl rollout status deployment/myapp

# Rollback neu can
kubectl rollout undo deployment/myapp
```

---

## 5. Deploy voi Cloud (Terraform)

### AWS: ECR + ECS Fargate + ALB

Thu muc `terraform/aws/` cung cap toan bo stack:

```bash
cd terraform/aws
cp terraform.tfvars.example terraform.tfvars
# Sua terraform.tfvars voi gia tri cua ban

terraform init
terraform plan
terraform apply
```

Tai nguyen duoc tao:
- **ECR** — container registry voi scan-on-push va lifecycle policy (10 image)
- **ECS Fargate** — serverless container, khong can quan ly EC2
- **ALB** — application load balancer voi health check `/health`
- **Auto-scaling** — target tracking theo CPU (70%) va memory (80%)
- **CloudWatch Logs** — luu 90 ngay trong prod, 14 ngay trong staging

Chi tiet day du xem [Huong dan Infrastructure as Code](./infrastructure-as-code.md).

### GCP: Artifact Registry + Cloud Run

```bash
cd terraform/gcp
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply
```

Tai nguyen duoc tao:
- **Artifact Registry** — Docker repository voi cleanup policy (10 image gan nhat)
- **Cloud Run v2** — auto-scaling (min/max instance), startup + liveness probe
- **VPC connector** — truy cap private den Memorystore Redis
- **Public IAM** — truy cap khong can xac thuc cho public API

Cloud Run dung startup probe tren `/health` voi 10s delay ban dau va liveness probe moi 30s.

---

## 6. Health Check va Graceful Shutdown

nestjs-boot cung cap `HealthModule` va `ShutdownModule` hoat dong cung nhau cho deploy khong downtime.

### Hanh vi Health Endpoint

| Trang thai | Response | Hieu ung |
|------------|----------|----------|
| Chay binh thuong | `200 OK` + chi tiet indicator | Nhan traffic |
| Dang shutdown | `503 Service Unavailable` | Bi xoa khoi LB/endpoints |
| DB/Redis down | `503` + indicator loi | Danh dau unhealthy |

Health controller kiem tra `ShutdownService.isShuttingDownNow()` va throw `ServiceUnavailableException` khi shutdown, lam readiness probe fail ngay lap tuc.

### Trinh tu Shutdown

```
SIGTERM duoc nhan
    │
    ▼
ShutdownService.shuttingDownFlag = true
    │
    ▼
/health tra ve 503 (readiness fail)
    │
    ▼
LB / K8s xoa pod khoi rotation
    │
    ▼
Phase 1: beforeShutdown hook (don dep tuy chinh)
    │
    ▼
Phase 2: server.close() — ngung ket noi moi, drain request dang xu ly
    │
    ▼
Phase 2b: closeAllConnections() — drain keep-alive (Node 18.2+)
    │
    ▼
Process thoat
```

### Canh chinh preStop Hook trong K8s

Deployment template bao gom preStop hook:

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 5"]
terminationGracePeriodSeconds: 35
```

Phan tich thoi gian:
- **preStop sleep 5s** — cho kube-proxy cap nhat iptables truoc khi app bat dau tu choi
- **App shutdown** — toi da 30s cho hook `beforeShutdown` + drain ket noi
- **terminationGracePeriodSeconds: 35** — phai lon hon preStop (5s) + app shutdown timeout

Bien moi truong `BOOT_PRESTOP_DELAY_MS` (mac dinh 5000) cho phep dieu chinh delay ma khong can thay doi Dockerfile.

### Tich hop Docker Compose

Docker Compose dung `HEALTHCHECK` tich hop trong Dockerfile. `start_period: 30s` ngan viec restart sai khi cold boot. `depends_on: condition: service_healthy` tren nginx dam bao LB chi bat dau dinh tuyen sau khi app san sang.

---

## 7. CI/CD: Pipeline Tu dong

### GitHub Actions

File `.github/workflows/ci.yml` chay: lint, test (sharded), build, va Docker push:

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

`docker/metadata-action` tu dong tao tag: SHA cho moi push len main, semver cho git tag.

De deploy sau khi push, them buoc SSH den server hoac trigger `kubectl set image`. Xem [Huong dan Deployment Strategies](./deployment-strategies.md).

### GitLab CI

File `.gitlab-ci.yml` push len GitLab Container Registry:

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

### Release theo Tag

Ca hai CI template tu dong build va push khi tao git tag:

```bash
git tag v1.2.3
git push origin v1.2.3
# CI build va push myapp:v1.2.3 + myapp:1.2
```

---

## 8. Giam sat sau Deploy

### Kiem tra Health Endpoint

```bash
# Kiem tra ngay
curl -f http://your-app.example.com/health

# Giam sat lien tuc
watch -n 5 'curl -s http://your-app.example.com/health | jq .'
```

### Prometheus Metrics

Observability stack (`docker-compose.observability.yml`) bao gom Prometheus da cau hinh scrape `/metrics`:

```bash
docker compose -f docker-compose.observability.yml up -d

# Endpoints:
# Prometheus  → http://localhost:9090
# Grafana     → http://localhost:3030  (admin / admin)
# Jaeger      → http://localhost:16686
```

Cau hinh nginx han che `/metrics` chi cho mang noi bo (`10.0.0.0/8`, `172.16.0.0/12`).

### Log tap trung

Observability stack bao gom Loki + Promtail cho log tap trung. Tren ECS, log tu dong di vao CloudWatch. Tren K8s, dung Loki stack hoac log aggregator ban thich.

### Cac metric can theo doi

| Metric | Nguong canh bao |
|--------|----------------|
| Ti le loi HTTP (5xx) | > 1% trong 5 phut |
| Do tre response p99 | > 2s |
| Health check that bai | > 2 lan lien tiep |
| Su dung memory | > 80% limit |
| CPU utilization | > 70% lien tuc |

Xem [Huong dan Observability](./observability.md) va [Huong dan Alerts](./alerts.md) de thiet lap chi tiet.

---

## 9. Xu ly su co

### Container khong khoi dong

```bash
# Kiem tra log
docker logs <container-id>
docker compose -f docker-compose.prod.yml logs app

# Nguyen nhan thuong gap:
# 1. Thieu bien moi truong → "Cannot read property of undefined"
# 2. Sai NODE_ENV → dev dependencies khong duoc cai
# 3. Xung dot port → "EADDRINUSE"
```

**Cach sua:** Kiem tra `.env.production` co du cac bien can thiet. Chay `docker compose config` de xem gia tri da phan giai.

### Health Check that bai

```bash
# Test tu ben trong container
docker exec <container-id> wget -qO- http://localhost:3000/health

# Nguyen nhan thuong gap:
# 1. App chua san sang → tang start_period
# 2. DB khong ket noi duoc → kiem tra network/DNS
# 3. Dang shutdown → kiem tra log co "shutting down"
```

### Loi ket noi (DB/Redis)

```bash
# Kiem tra ket noi mang
docker exec <app-container> wget -qO- http://mongodb:27017 2>&1

# Nguyen nhan thuong gap:
# 1. Service tren Docker network khac nhau → dung cung network trong compose
# 2. host.docker.internal khong kha dung → dung ten service
# 3. Can xac thuc → kiem tra MONGO_INITDB_ROOT_USERNAME khop voi MONGO_URI
```

### Loi pull Image

```bash
# GHCR: xac minh token co scope read:packages
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# ECR: token het han moi 12 gio
aws ecr get-login-password | docker login --username AWS --password-stdin <ecr-url>

# K8s: tao image pull secret
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=USERNAME \
  --docker-password=$GITHUB_TOKEN
```

### K8s Pod CrashLoopBackOff

```bash
kubectl describe pod <pod-name>    # Kiem tra phan Events
kubectl logs <pod-name> --previous # Log tu instance bi crash

# Nguyen nhan thuong gap:
# 1. OOMKilled → tang memory limit trong deployment.yaml
# 2. Liveness probe qua nghiem ngat → tang initialDelaySeconds
# 3. Thieu ConfigMap → apply configmap.yaml truoc
```

---

## Cac huong dan lien quan

- [Health & Shutdown](./health-shutdown.md) — chi tiet ve health indicator va shutdown hook
- [Load Balancing](./load-balancing.md) — chien luoc va sticky session
- [Deployment Strategies](./deployment-strategies.md) — blue-green, canary, rolling
- [Infrastructure as Code](./infrastructure-as-code.md) — huong dan Terraform day du
- [Observability](./observability.md) — metrics, tracing, logging
- [Production Checklist](./production-checklist.md) — kiem tra truoc khi launch
