# Danh sách kiểm tra sẵn sàng Production

Sử dụng danh sách này trước mỗi lần triển khai production cho service nestjs-boot.
Mỗi mục bao gồm giải thích ngắn tại sao nó quan trọng.

---

## Bảo mật

- [ ] **JWT secret >= 32 ký tự** — Secret ngắn có thể bị brute-force. Tạo bằng
  `openssl rand -base64 48`. Đặt qua `auth.jwt.secret` (env: `JWT_SECRET`).

- [ ] **Thuật toán JWT được chỉ định** — Đặt `auth.jwt.signOptions.algorithm` rõ ràng (ví dụ: `'HS256'`).
  Nếu không, kẻ tấn công kiểm soát header token có thể chuyển sang `'none'`.

- [ ] **`resetSecret` riêng biệt** — Sử dụng `auth.jwt.resetSecret` cho token reset mật khẩu / xác minh email.
  Nếu dùng chung secret chính, token reset bị lộ trở thành token phiên.

- [ ] **Rate limiting trên endpoint auth** — `/auth/login`, `/auth/refresh` nên có
  giới hạn rate nghiêm ngặt hơn các endpoint khác. Xem `docs/guides/auth-rate-limiting.md`.

- [ ] **Docker image chạy user non-root** — Dockerfile chạy với `USER node` (không phải root).
  Root trong container = root trên host nếu xảy ra container escape.
  `Dockerfile` được tạo sử dụng `USER node` mặc định.

- [ ] **Secret không nằm trong file env** — File `.env` được gitignore. Inject secret qua:
  - K8s: `Secret` + `envFrom.secretRef`
  - Docker: `--env-file` (không bao giờ đóng vào image)
  - CI/CD: GitHub Secrets / GitLab CI Variables
  - Production: HashiCorp Vault hoặc AWS Secrets Manager với adapter `ConfigService` tùy chỉnh.

- [ ] **Bảo vệ path traversal cho storage** — `LocalAdapter` sử dụng `safePath()` để từ chối
  key chứa `../`. Nếu bạn xây endpoint download tùy chỉnh, luôn phân giải đường dẫn dựa trên
  thư mục upload và xác minh kết quả nằm trong giới hạn.

---

## Database

- [ ] **Replica set được bật** — Transaction Mongoose yêu cầu replica set (ngay cả single-node:
  `mongod --replSet rs0`). Không có nó, `session.startTransaction()` ném lỗi runtime.

- [ ] **Connection pooling được điều chỉnh** — Đặt `database.connections.*.options.maxPoolSize` (mặc định: 100).
  Quá thấp = thiếu kết nối khi tải cao. Quá cao = MongoDB OOM. Bắt đầu với 20-50 mỗi pod.

- [ ] **Read replica được cấu hình** — Cho service đọc nhiều, đặt `readerUri` trên connection.
  Đọc tự động định tuyến tới replica; ghi luôn đi primary.

- [ ] **Index đã được tạo** — Chạy script migration/index trước khi triển khai. Thiếu index =
  query chậm khi tải production mà không thể hiện trong dev.

- [ ] **Chiến lược backup cho MongoDB** — `mongodump` định kỳ hoặc Atlas snapshot theo lịch.
  Test khôi phục trước khi go-live, không phải trong lúc sự cố.

---

## Cache

- [ ] **Redis persistence được cấu hình** — Bật AOF hoặc RDB trong cấu hình Redis. Không có persistence,
  Redis restart mất tất cả dữ liệu cache và session, gây thundering herd vào DB.

- [ ] **`maxmemory-policy` Redis được đặt** — Mặc định là `noeviction` (từ chối ghi khi đầy).
  Cho use-case cache, ưu tiên `allkeys-lru`. Thêm vào cấu hình Redis hoặc docker-compose.

- [ ] **Hiểu rõ thu hồi L1** — Cache in-memory L1 sử dụng LRU với kích thước tối đa cố định.
  Đặt `cache.defaultTtl` (mặc định: 300s) phù hợp. Quá dài = dữ liệu cũ; quá ngắn =
  tỷ lệ miss L1 làm mất ý nghĩa hai lớp.

---

## Health Check & Probe

- [ ] **Endpoint health phản hồi** — `curl http://localhost:3000/health` trả về `{"status":"ok"}`.
  Cần thiết cho K8s liveness/readiness probe. Cấu hình qua `health: { path: '/health' }`.

- [ ] **Probe K8s được cấu hình** — `livenessProbe` + `readinessProbe` đều trỏ tới `/health`.
  Readiness probe loại pod khỏi LB khi rolling deploy. `k8s/deployment.yaml` được tạo
  bao gồm mặc định.
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

- [ ] **Hook preStop K8s được đặt** — Cho iptables thời gian ngừng routing trước khi SIGTERM đến
  (ngăn 502 khi deploy). `k8s/deployment.yaml` được tạo bao gồm mặc định.
  ```yaml
  lifecycle:
    preStop:
      exec:
        command: ["sh", "-c", "sleep 5"]
  ```

---

## Tắt máy duyên dáng

- [ ] **Module shutdown được bật** — Đặt `shutdown: {}` trong BootOptions (mặc định: timeout 30s,
  chiến lược drain `'drain'`, signal `['SIGTERM', 'SIGINT']`).

- [ ] **Chiến lược drain là `'drain'`** — Mặc định chờ request đang xử lý hoàn thành.
  Không bao giờ dùng `'immediate'` trong production trừ khi chấp nhận mất request.

- [ ] **InFlightTracker hoạt động** — ShutdownModule sử dụng `InFlightTracker` để đếm request
  đang xử lý. Endpoint health trả về 503 khi bắt đầu shutdown, khiến K8s ngừng routing.

- [ ] **Shutdown được test end-to-end** — Gửi SIGTERM tới instance đang chạy và xác minh:
  1. `/health` trả về 503 ngay lập tức
  2. Request đang xử lý hoàn thành trước khi process thoát
  3. Process thoát trong `shutdown.timeout` (mặc định: 30s)

---

## Observability

- [ ] **Structured logging (JSON, không pretty)** — Đặt `NODE_ENV=production` hoặc
  `logging: { prettyPrint: false }`. Log pretty-print lãng phí byte và làm hỏng log aggregator
  (Datadog, Loki, CloudWatch).

- [ ] **Correlation ID được truyền** — Mỗi dòng log có field `correlationId` và lời gọi HTTP
  đi chuyển tiếp header `X-Correlation-Id`. Cấu hình qua `correlation: {}`.

- [ ] **Endpoint metric được cấu hình** — Prometheus scrape endpoint tại `/metrics` trả về
  metric process + HTTP. Cấu hình qua `metrics: { path: '/metrics' }`.

- [ ] **OTel tracing được cấu hình** — Đặt `tracing: { exporter: 'otlp', endpoint: '...' }`.
  Sử dụng `sampleRate: 0.1` trong production (1.0 = trace mọi request = bùng nổ lưu trữ).

- [ ] **Error monitoring được kết nối** — Kết nối Sentry/Datadog qua `monitoring.errorReporter`:
  ```ts
  monitoring: {
    errorReporter: (error, context) => Sentry.captureException(error, { extra: context }),
  }
  ```

---

## Khả năng phục hồi

- [ ] **Mặc định circuit breaker được xem xét** — Mặc định: 5 lỗi để mở, timeout reset 30s,
  1 request ở trạng thái half-open. Điều chỉnh `resilience.circuitBreaker` theo SLA downstream.

- [ ] **Chính sách retry được cấu hình** — Mặc định: 3 lần thử, backoff theo hàm mũ, delay cơ sở 1s,
  delay tối đa 10s. Đặt predicate `retryOn` để tránh retry lỗi non-idempotent.

- [ ] **Timeout được đặt** — Mặc định: 30s qua `resilience.timeout.default`. Giảm cho
  API hướng người dùng (5-10s). Gateway timeout nên vượt giá trị này.

---

## Thanh toán

- [ ] **Chữ ký webhook được xác minh** — `webhooks.providers.stripe.secret` và
  `webhooks.providers.paypal.secret` phải là signing secret production.
  Không bao giờ bỏ qua xác minh chữ ký trong production.

- [ ] **Cache idempotency có giới hạn** — `IdempotencyGuard` sử dụng Map in-memory giới hạn
  10.000 mục với thu hồi theo TTL. Cho endpoint thanh toán thông lượng cao, thay provider
  `IDEMPOTENCY_CACHE` bằng lưu trữ Redis.

---

## Docker & Triển khai

- [ ] **Dockerfile multi-stage** — Stage build cài dev dep + biên dịch; stage production
  chỉ copy `dist/` + `node_modules` (production). Giảm kích thước image 3-5 lần.

- [ ] **Tag image không phải `latest`** — Sử dụng SHA hoặc semver tag để hỗ trợ rollback.
  Ví dụ: `myservice:a1b2c3d` (git SHA).

- [ ] **Giới hạn tài nguyên được đặt** — K8s `resources.limits` và `resources.requests` đều được định nghĩa.
  `k8s/deployment.yaml` được tạo đặt `128Mi/256Mi` bộ nhớ và `100m/500m` CPU.

- [ ] **HPA được cấu hình** — `HorizontalPodAutoscaler` scale pod khi CPU >= 70% và
  memory >= 80%. `k8s/hpa.yaml` được tạo bao gồm mặc định.

---

## Môi trường

- [ ] **File `.env` không nằm trong image** — `.env` chỉ dành cho dev cục bộ. `.env.production` ghi đè
  `.env` khi `NODE_ENV=production` (được load bởi `loadEnvFiles()` của `createApp`).

- [ ] **Secret trong Vault/cloud** — Cho production, sử dụng HashiCorp Vault, AWS Secrets Manager,
  hoặc GCP Secret Manager. Inject qua biến env hoặc adapter config tùy chỉnh, không phải file `.env`.

---

## Smoke Test sau triển khai

Chạy những lệnh này sau mỗi lần triển khai production:

```bash
# 1. Health check
curl -sf http://YOUR_SERVICE/health | jq .

# 2. Endpoint metric (nếu bật)
curl -sf http://YOUR_SERVICE/metrics | head -20

# 3. Endpoint auth (nếu JWT bật) — mong đợi 401
curl -sf -o /dev/null -w "%{http_code}" http://YOUR_SERVICE/auth/profile

# 4. Mô phỏng readiness probe
curl -sf http://YOUR_SERVICE/health  # mong đợi 200 trong 10s sau triển khai
```
