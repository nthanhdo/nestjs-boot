# Tham chiếu CLI — nestjs-boot

> Tạo khung microservice NestJS sẵn sàng production bằng một lệnh.

---

## Bắt đầu nhanh

```bash
npx nestjs-boot new my-service
```

Lệnh này khởi chạy wizard tương tác hướng dẫn qua các tùy chọn database, cache, auth, và transport, rồi tạo dự án hoàn chỉnh với Docker, K8s manifest, test, và cấu hình CI.

---

## Lệnh

```
nestjs-boot new <project-name> [options]
```

Từ khóa `new` là tùy chọn — `npx nestjs-boot my-service` cũng hoạt động.

---

## Cờ

| Cờ | Giá trị | Mặc định | Mô tả |
|------|--------|---------|-------------|
| `--db=<type>` | `mongodb`, `none` | `mongodb` | Database provider |
| `--cache=<type>` | `redis`, `memcached`, `none` | `redis` | Cache provider |
| `--auth=<type>` | `jwt`, `none` | `jwt` | Chiến lược xác thực |
| `--transport=<type>` | `http`, `grpc`, `tcp`, `nats`, `rabbitmq` | `http` | Tầng transport (luôn bao gồm HTTP) |
| `--ci=<provider>` | `github`, `gitlab` | không | Tạo cấu hình CI/CD pipeline |
| `--observability` | cờ | tắt | Bao gồm Prometheus, dashboard Grafana, Jaeger, Loki docker-compose |
| `-y`, `--yes` | cờ | tắt | Chấp nhận tất cả mặc định, bỏ qua prompt |
| `-h`, `--help` | cờ | — | Hiện trợ giúp |

### Ví dụ

```bash
# Full stack với gRPC + GitHub Actions
npx nestjs-boot new order-service --db=mongodb --cache=redis --auth=jwt --transport=grpc --ci=github

# Service HTTP tối giản, không prompt
npx nestjs-boot new my-api --db=none --cache=none --auth=none -y

# Với observability stack
npx nestjs-boot new analytics-service --observability

# Tất cả mặc định, không prompt
npx nestjs-boot new my-service -y
```

---

## Prompt tương tác

Khi cờ không được cung cấp, CLI hỏi từng tùy chọn:

1. **Tên dự án** — chữ thường alphanumeric với gạch nối (ví dụ: `order-service`)
2. **Database** — MongoDB (Mongoose) hoặc Không
3. **Cache** — Redis, Memcached, hoặc Không
4. **Auth** — JWT hoặc Không
5. **Transport** — Chỉ HTTP, HTTP + gRPC, HTTP + TCP, HTTP + NATS, HTTP + RabbitMQ

Prompt được hỗ trợ bởi `@clack/prompts` với đầu ra màu qua `picocolors`.

---

## Cấu trúc file được tạo

```
my-service/
  src/
    main.ts                    # createApp() với tùy chọn đã chọn
    app.module.ts              # Module gốc
    app.controller.ts          # Endpoint Hello
    app.service.ts             # Service Hello
  test/
    app.e2e-spec.ts            # Test E2E (vitest + supertest)
  k8s/
    deployment.yaml            # Kubernetes Deployment
    service.yaml               # Kubernetes Service
    configmap.yaml             # ConfigMap biến môi trường
    hpa.yaml                   # Horizontal Pod Autoscaler
    ingress.yaml               # Tài nguyên Ingress
  proto/                       # Chỉ với --transport=grpc
    my-service.proto           # Định nghĩa gRPC service
  observability/               # Chỉ với --observability
    prometheus.yml
    grafana/
      dashboards/
        http-overview.json
        service-health.json
        microservice-overview.json
      alerts.yml
  .github/workflows/ci.yml    # Chỉ với --ci=github
  .gitlab-ci.yml               # Chỉ với --ci=gitlab
  Dockerfile                   # Multi-stage (builder + production)
  docker-compose.yml           # App + service hạ tầng
  docker-compose.override.yml  # Override dev (hot reload, debug port)
  docker-compose.observability.yml  # Chỉ với --observability
  package.json
  tsconfig.json
  vitest.config.ts
  .env / .env.example
  .gitignore
  .dockerignore
  .eslintrc.cjs
  .prettierrc
  README.md
```

---

## Template CI/CD

### GitHub Actions (`--ci=github`)

Tạo tại `.github/workflows/ci.yml`:

- **Ma trận:** Node 18.x + 20.x, 2 shard test
- **Bước:** checkout, npm ci, lint, test (phân shard qua `vitest --shard`), build
- **Job coverage:** chạy sau test, upload artifact

### GitLab CI (`--ci=gitlab`)

Tạo tại `.gitlab-ci.yml`:

- **Stage:** lint, test, build, coverage
- **Cache:** `node_modules/` theo khóa branch
- **Test song song:** 2 shard

---

## Template Kubernetes

Tất cả K8s manifest được tạo trong `k8s/` với giá trị mặc định hợp lý:

| File | Mô tả |
|------|-------------|
| `deployment.yaml` | 2 replica, giới hạn tài nguyên, probe liveness/readiness trên `/health` |
| `service.yaml` | ClusterIP trên port 3000 |
| `configmap.yaml` | Biến môi trường (NODE_ENV, mức log) |
| `hpa.yaml` | Tự động mở rộng 2-10 replica khi CPU >= 80% |
| `ingress.yaml` | Tài nguyên Ingress với placeholder TLS |

---

## Template Observability (`--observability`)

| File | Mô tả |
|------|-------------|
| `prometheus.yml` | Cấu hình scrape nhắm vào endpoint `/metrics` của app |
| `docker-compose.observability.yml` | Stack Prometheus + Grafana + Jaeger + Loki |
| `grafana/dashboards/http-overview.json` | Panel tỷ lệ request HTTP, độ trễ, tỷ lệ lỗi |
| `grafana/dashboards/service-health.json` | Panel CPU, bộ nhớ, event loop lag, GC |
| `grafana/dashboards/microservice-overview.json` | Đồ thị gọi cross-service, độ trễ liên service |
| `grafana/alerts.yml` | Quy tắc cảnh báo cho tỷ lệ lỗi, latency P99, pod restart |

---

## Tùy chỉnh Template

Template sử dụng cú pháp giống Handlebars với các directive sau:

| Cú pháp | Mô tả |
|--------|-------------|
| `{{name}}` | Thay thế tên dự án |
| `{{#if flag}}...{{/if}}` | Khối điều kiện (cờ boolean) |
| `{{#eq field "value"}}...{{/eq}}` | Kiểm tra bằng |
| `{{#neq field "value"}}...{{/neq}}` | Kiểm tra khác |
| `{{#in field "v1\|v2"}}...{{/in}}` | Kiểm tra bao gồm |

Template nằm trong thư mục `templates/` của package nestjs-boot. Để tùy chỉnh, fork repo và chỉnh sửa trực tiếp các file `.tpl`.

---

## Resource Generator

Tạo tài nguyên CRUD bên trong dự án hiện có:

```bash
npx nestjs-boot generate <resource-name>
npx nestjs-boot generate product
```

Tạo `src/<name>/` với schema, DTO, service, controller, module, và file test. Sử dụng `--minimal` để chỉ tạo module + service (không controller).
