# Tuần 13: CI/CD & DevOps

> **Stage 4 — Production | nestjs-boot Teaching Series**
> Prerequisite: Đã hoàn thành Stage 1–3 (TypeScript, NestJS, MongoDB, Auth, Cache, Testing, Microservices, Queue, Events, Observability)

---

## Mục tiêu học tập

Sau tuần này, sinh viên có thể:

1. Giải thích sự khác biệt giữa Continuous Integration, Continuous Delivery, và Continuous Deployment
2. Viết `Dockerfile` với multi-stage build và áp dụng best practices
3. Viết `docker-compose.yml` để orchestrate ứng dụng gồm app + MongoDB + Redis
4. Viết GitHub Actions workflow hoàn chỉnh: lint → typecheck → build → test → security scan → package
5. Đọc hiểu file `ci.yml` của nestjs-boot và giải thích từng bước
6. Quản lý environment variables theo từng môi trường (dev/staging/production)

---

## 1. Tại sao cần CI/CD? (WHY trước HOW)

### Câu chuyện thực tế: "Broken main branch"

Hãy tưởng tượng team 5 người đang làm dự án e-commerce. Ngày thứ Sáu trước deadline, một thành viên push code lên `main` mà **quên chạy test**. Sáng thứ Hai cả team pull về, chạy `npm test` thấy:

```
FAIL src/orders/orders.service.spec.ts
  ● OrdersService › createOrder › should throw when stock is 0
    Expected: BadRequestException
    Received: undefined
```

**Hậu quả:**
- 5 người bị block, không ai merge được PR mới
- 2 tiếng debug mới tìm ra commit lỗi
- Khách hàng demo bị delay

**CI/CD giải quyết vấn đề này như thế nào?**

> Thay vì tin tưởng con người nhớ chạy test, ta **bắt máy tính làm điều đó tự động** mỗi khi có code mới. Nếu test fail → code không được merge → main branch luôn "xanh".

### Ba khái niệm cốt lõi

| Thuật ngữ | Nghĩa | Ví dụ thực tế |
|-----------|-------|---------------|
| **Continuous Integration (CI)** | Tự động build + test mỗi khi push code | GitHub Actions chạy `npm test` khi mở PR |
| **Continuous Delivery (CD)** | Tự động chuẩn bị artifact sẵn sàng deploy — nhưng **người phải bấm nút deploy** | Build Docker image, push lên registry, chờ approve |
| **Continuous Deployment** | Tự động deploy thẳng lên production khi CI pass — **không cần người bấm** | Mỗi merge vào `main` → tự deploy lên server |

**Nhiều công ty dùng Continuous Delivery** (không phải Deployment) cho production vì cần human review trước khi deploy.

---

## 2. Docker Fundamentals

### 2.1 Container vs Virtual Machine

```
Virtual Machine (VM):
┌─────────────────────────────┐
│  App A   │  App B   │  App C│
│ (Node)   │ (Python) │ (Java)│
├──────────┼──────────┼───────┤
│  Guest OS│  Guest OS│Guest OS
│  (Linux) │  (Linux) │(Linux)│
├─────────────────────────────┤
│         Hypervisor          │
├─────────────────────────────┤
│         Host OS             │
├─────────────────────────────┤
│         Hardware            │
└─────────────────────────────┘
Mỗi VM có cả một OS riêng → nặng (GBs), boot chậm (~30s)

Container:
┌─────────────────────────────┐
│  App A   │  App B   │  App C│
│ (Node)   │ (Python) │ (Java)│
├─────────────────────────────┤
│         Container Runtime   │
│         (Docker Engine)     │
├─────────────────────────────┤
│         Host OS (Linux)     │
├─────────────────────────────┤
│         Hardware            │
└─────────────────────────────┘
Chia sẻ kernel của host OS → nhẹ (MBs), start nhanh (<1s)
```

**Khi nào dùng VM?** Khi cần isolation hoàn toàn (security critical), hoặc chạy OS khác (Windows trên Linux host).

**Khi nào dùng Container?** Hầu hết trường hợp microservices — nhẹ hơn, scale nhanh hơn, CI/CD nhanh hơn.

### 2.2 Image vs Container

- **Image**: Blueprint — read-only, giống như class trong OOP
- **Container**: Instance đang chạy — giống như object được tạo từ class

```bash
# Image: nestjs-boot-app (blueprint)
docker build -t nestjs-boot-app .

# Container: chạy 3 instance từ 1 image
docker run -d --name app-1 -p 3000:3000 nestjs-boot-app
docker run -d --name app-2 -p 3001:3000 nestjs-boot-app
docker run -d --name app-3 -p 3002:3000 nestjs-boot-app
```

### 2.3 Dockerfile Anatomy

```dockerfile
# Dockerfile cơ bản (CHƯA tốt — xem phần best practices)
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
CMD ["node", "dist/main.js"]
```

**Vấn đề với Dockerfile trên:**
1. `node:20` bao gồm cả build tools, npm, yarn... → image 1GB+
2. `COPY . .` copy cả `node_modules/`, `.git/` → chậm và lớn
3. Chạy dưới quyền `root` → security risk
4. Mỗi lần thay đổi code → reinstall toàn bộ dependencies

---

## 3. Dockerfile Best Practices

### 3.1 Multi-stage Build

**Tư duy:** Build và runtime cần hai môi trường khác nhau. Build cần TypeScript compiler, devDependencies. Runtime chỉ cần compiled JS.

```dockerfile
# ============ STAGE 1: Build ============
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files TRƯỚC (tận dụng layer cache)
COPY package*.json ./

# Cài đầy đủ dependencies (bao gồm devDeps để build)
RUN npm ci

# Copy source code
COPY tsconfig*.json ./
COPY src/ ./src/

# Build TypeScript → JavaScript
RUN npm run build

# ============ STAGE 2: Production Runtime ============
FROM node:20-alpine AS production

# Tạo user không phải root (security best practice)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Chỉ copy package files
COPY package*.json ./

# Chỉ cài production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy compiled output từ stage builder
COPY --from=builder /app/dist ./dist

# Đổi ownership về appuser
RUN chown -R appuser:appgroup /app

# Chạy với quyền non-root
USER appuser

# Document port (không thực sự expose, chỉ để documentation)
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
```

**So sánh kết quả:**
| Approach | Image size |
|----------|-----------|
| Naive (không multi-stage) | ~1.2 GB |
| Multi-stage | ~180 MB |

### 3.2 .dockerignore

Tạo file `.dockerignore` — giống `.gitignore` nhưng cho Docker:

```
# .dockerignore
node_modules/
dist/
.git/
.github/
*.md
coverage/
.env
.env.*
docker-compose*.yml
```

**Tại sao quan trọng?**
- Không copy `node_modules/` → COPY nhanh hơn
- Không copy `.env` → không leak secrets vào image
- Build context nhỏ → Docker daemon nhận ít data hơn

### 3.3 Layer Caching — Trick quan trọng nhất

Docker cache mỗi layer. Nếu layer không thay đổi, Docker dùng cache.

```dockerfile
# ❌ SAI: COPY tất cả trước → mỗi lần thay code, npm ci chạy lại
COPY . .
RUN npm ci

# ✅ ĐÚNG: COPY package.json trước → npm ci chỉ chạy lại khi dependencies thay đổi
COPY package*.json ./
RUN npm ci
COPY . .
```

**Quy tắc:** Những gì thay đổi ít → để TRƯỚC trong Dockerfile. Code thay đổi nhiều → để CUỐI.

---

## 4. docker-compose: Multi-container Orchestration

### 4.1 Tại sao cần docker-compose?

Ứng dụng production thường cần nhiều services:
- App (NestJS)
- Database (MongoDB)
- Cache (Redis)
- (Optional) Message broker (RabbitMQ/Kafka)

Chạy từng `docker run` riêng lẻ → khó quản lý dependencies, network, volumes.

### 4.2 Phân tích docker-compose.yml của nestjs-boot

File thực tế: `examples/microservices/docker-compose.yml`

```yaml
version: '3.8'

services:
  api-gateway:
    build: ./api-gateway          # Build từ Dockerfile trong thư mục này
    ports:
      - '3000:3000'               # HOST:CONTAINER port mapping
    depends_on:                   # Chờ services này start trước
      - auth-service
      - order-service
    environment:
      JWT_SECRET: dev-secret-change-in-production
      AUTH_SERVICE_URL: auth-service:5000  # Dùng service name làm hostname

  auth-service:
    build: ./auth-service
    ports:
      - '3003:3003'    # HTTP port
      - '5001:5000'    # gRPC port
    depends_on:
      - mongodb        # Cần MongoDB trước khi start
    environment:
      MONGO_URI: mongodb://mongodb:27017/auth

  mongodb:
    image: mongo:7     # Dùng official image, không cần build
    ports:
      - '27017:27017'
    volumes:
      - mongo-data:/data/db  # Named volume — data persist qua restart

  redis:
    image: redis:7-alpine  # Alpine = nhỏ hơn
    ports:
      - '6379:6379'

volumes:
  mongo-data:          # Docker quản lý volume này
  file-uploads:
```

**Điểm chú ý:**
- Services giao tiếp nhau qua **service name** (`auth-service:5000`), không phải `localhost`
- `depends_on` chỉ đảm bảo **start order**, không đảm bảo service đã **ready**. Cần healthcheck để chắc chắn

### 4.3 docker-compose cho Development

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build:
      context: .
      target: builder     # Dừng ở stage builder để có dev tools
    ports:
      - '3000:3000'
      - '9229:9229'       # Node.js debugger port
    volumes:
      - .:/app            # Mount source code → hot reload
      - /app/node_modules # Tránh override node_modules từ host
    command: npm run start:dev
    environment:
      NODE_ENV: development
    depends_on:
      - mongodb
      - redis

  mongodb:
    image: mongo:7
    ports:
      - '27017:27017'
    volumes:
      - mongo-dev-data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  mongo-dev-data:
```

---

## 5. GitHub Actions: CI Pipeline

### 5.1 Workflow Anatomy

```
.github/
└── workflows/
    └── ci.yml         ← Mỗi file = 1 workflow
```

**Cấu trúc cơ bản:**

```yaml
name: Tên workflow (hiển thị trên GitHub UI)

on:                    # Triggers — khi nào chạy?
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:                  # Các job (chạy song song hoặc tuần tự)
  job-name:
    runs-on: ubuntu-latest   # Runner environment
    steps:             # Các bước trong job (chạy tuần tự)
      - uses: action@version # Dùng action có sẵn
      - run: command         # Chạy shell command
```

### 5.2 Phân tích ci.yml của nestjs-boot

File thực tế: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]      # Chạy khi push lên main
  pull_request:
    branches: [main]      # Chạy khi mở PR vào main

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]   # Test trên cả Node 20 và 22 song song
    steps:
      # Step 1: Checkout code
      - uses: actions/checkout@v4
      # Tại sao? Runner không có code — phải clone repo trước

      # Step 2: Setup Node.js với cache
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm          # Cache ~/.npm → install nhanh hơn lần 2+

      # Step 3: Install dependencies (reproducible)
      - run: npm ci
      # npm ci vs npm install:
      # - npm ci: đọc package-lock.json, không thay đổi, nhanh hơn
      # - npm install: có thể update package-lock.json, chậm hơn

      # Step 4: Type check
      - run: npx tsc --noEmit
      # Tại sao trước build? Fail fast — nếu có type error, không waste time build

      # Step 5: Build
      - run: npm run build
      # Verify code compile được thành JS

      # Step 6: Test
      - run: npm test -- --reporter=verbose
      # --reporter=verbose: hiện tên từng test case → dễ debug khi fail

      # Step 7: Lint (sau test để fail fast ở test trước)
      - run: npm run lint

      # Step 8: Security scan
      - run: npm audit --audit-level=high
      # Scan dependencies cho CVEs (Common Vulnerabilities and Exposures)
      # --audit-level=high: chỉ fail khi có vulnerability mức high/critical
      # moderate/low vulnerabilities → warning, không fail CI

      # Step 9: Verify package publishable
      - run: npm pack --dry-run
      # Verify package.json "files" field đúng, package có thể publish được
```

**Thứ tự các steps và lý do:**

```
checkout → setup node → install deps → typecheck → build → test → lint → audit → pack
    ↑                                      ↑
Phải có code và node                  Fail fast: type errors
trước khi làm gì                      rẻ hơn là đợi build xong
```

**Matrix Strategy:**
```yaml
strategy:
  matrix:
    node-version: [20, 22]
```
→ GitHub tạo 2 jobs song song: một chạy Node 20, một chạy Node 22. Đảm bảo library tương thích cả hai version.

### 5.3 Caching trong CI

Không có cache, mỗi lần CI chạy sẽ download toàn bộ `node_modules` (~30-60s). Với cache:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm   # Cache dựa trên hash của package-lock.json
```

**Cách hoạt động:**
1. Lần đầu: cache miss → `npm ci` chạy bình thường → cache được lưu
2. Lần sau: cache hit (package-lock.json không đổi) → restore từ cache → `npm ci` chỉ verify (~5s)

### 5.4 Secrets Management

```yaml
# KHÔNG BAO GIỜ hardcode secrets trong workflow file
- run: docker push ghcr.io/myorg/myapp
  env:
    CR_PAT: ${{ secrets.CR_PAT }}  # Lấy từ GitHub Secrets
```

Cài đặt secrets: `Settings → Secrets and variables → Actions → New repository secret`

---

## 6. Environment Management

### 6.1 Pipeline môi trường

```
Developer PC (dev) → PR merge (staging) → Manual approve → Production
     ↓                      ↓                                   ↓
 .env.local           .env.staging                        .env.production
 (gitignored)         (GitHub Secrets)                    (GitHub Secrets)
```

### 6.2 12-Factor App: Config qua Environment Variables

Nguyên tắc: **Không bao giờ hardcode config trong code**. Config khác nhau giữa môi trường → dùng env vars.

```typescript
// ❌ SAI
const mongoUri = 'mongodb://localhost:27017/myapp';

// ✅ ĐÚNG
const mongoUri = process.env.MONGO_URI;
```

### 6.3 nestjs-boot Config Module

```typescript
// Với nestjs-boot, config được validate bằng Zod/class-validator
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV ?? 'development'}`,
      isGlobal: true,
    }),
  ],
})
export class AppModule {}
```

---

## 7. npm audit: Security Scanning

### 7.1 Tại sao quan trọng?

Supply chain attacks ngày càng phổ biến. Năm 2021, `ua-parser-js` (12M downloads/week) bị compromise — attacker inject crypto miner vào package. Nếu bạn dùng package này và không scan → ứng dụng của bạn bị nhiễm.

### 7.2 Cách đọc npm audit output

```bash
npm audit

# Output:
found 2 vulnerabilities (1 moderate, 1 high)

  high: Prototype Pollution in lodash
  Package: lodash
  Patched in: >=4.17.21
  Dependency of: myapp
  Path: myapp > lodash
  More info: https://npmjs.com/advisories/1523
```

### 7.3 npm audit trong CI

```yaml
- run: npm audit --audit-level=high
```

- `--audit-level=critical`: chỉ fail khi có critical (ít nhất, nên dùng cho libraries)
- `--audit-level=high`: fail khi có high hoặc critical (recommended cho applications)
- `--audit-level=moderate`: fail khi có moderate+ (strict)

```bash
# Fix tự động (cẩn thận với breaking changes)
npm audit fix

# Xem fix cần breaking changes
npm audit fix --dry-run
```

---

## 8. Hands-on Lab

### Lab 1: Viết Dockerfile cho NestJS app

**Bước 1:** Clone nestjs-boot hoặc dùng NestJS app của bạn từ Stage 1-3

**Bước 2:** Tạo `Dockerfile` với multi-stage build:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN chown -R app:app /app
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**Bước 3:** Tạo `.dockerignore`

**Bước 4:** Build và verify:
```bash
docker build -t my-nestjs-app .
docker images my-nestjs-app  # Kiểm tra size

# Chạy thử
docker run -p 3000:3000 --env-file .env my-nestjs-app
curl http://localhost:3000/health
```

### Lab 2: docker-compose với app + MongoDB + Redis

Tạo `docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: production
      MONGO_URI: mongodb://mongodb:27017/myapp
      REDIS_URL: redis://redis:6379
    depends_on:
      - mongodb
      - redis
    restart: unless-stopped

  mongodb:
    image: mongo:7
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  mongo-data:
```

```bash
docker compose up -d
docker compose logs app
docker compose down
```

### Lab 3: GitHub Actions CI Pipeline

Tạo `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run build
      - run: npm test -- --coverage
      - run: npm run lint
      - run: npm audit --audit-level=high
```

**Bonus:** Thêm coverage badge vào README:
```yaml
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
```

---

## 9. Bài tập về nhà

### Bài 1 (Bắt buộc)
Setup CI/CD cho personal project (dự án từ Stage 1-3) với:
- [ ] Dockerfile với multi-stage build
- [ ] .dockerignore đầy đủ
- [ ] docker-compose (app + MongoDB + Redis)
- [ ] GitHub Actions: lint + typecheck + build + test + npm audit
- [ ] CI badge hiển thị trên README

### Bài 2 (Nâng cao)
Thêm CD stage vào workflow:
```yaml
deploy:
  needs: ci          # Chạy sau khi CI pass
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'  # Chỉ deploy khi merge vào main
  steps:
    - name: Build and push Docker image
      run: |
        docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
        echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
        docker push ghcr.io/${{ github.repository }}:${{ github.sha }}
```

### Bài 3 (Research)
Tìm hiểu và viết báo cáo 1 trang (tiếng Việt) về một trong:
- GitHub Actions vs GitLab CI vs Jenkins — trade-offs
- Docker Swarm vs Kubernetes — khi nào dùng cái nào?

---

## 10. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `npm ci` fail trong CI | `package-lock.json` không được commit | Commit `package-lock.json` |
| Container start nhưng app lỗi | `MONGO_URI` trỏ về `localhost` thay vì service name | Dùng `mongodb:27017` (service name) |
| Image quá lớn | Không dùng multi-stage, copy cả `node_modules` dev | Áp dụng multi-stage build |
| CI chậm | Không cache dependencies | Thêm `cache: npm` vào `setup-node` |
| `.env` bị copy vào image | Thiếu `.dockerignore` | Thêm `.env*` vào `.dockerignore` |
| `npm audit` fail CI vô lý | Có vulnerability trong devDependencies | Dùng `npm audit --only=prod` hoặc fix/exception |

---

## 11. Câu hỏi tự kiểm tra

1. Sự khác biệt giữa Continuous Delivery và Continuous Deployment là gì?
2. Tại sao lại `COPY package*.json ./` TRƯỚC `COPY . .` trong Dockerfile?
3. Trong docker-compose, các services giao tiếp nhau qua hostname nào?
4. Tại sao CI của nestjs-boot chạy `tsc --noEmit` TRƯỚC `npm run build`?
5. `npm ci` khác `npm install` ở điểm nào? Tại sao dùng `npm ci` trong CI?
6. Matrix strategy trong GitHub Actions giúp ích gì?
7. Nếu `npm audit --audit-level=high` fail, bạn làm gì?

---

## 12. Đọc thêm

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [12-Factor App](https://12factor.net/)
- [npm audit documentation](https://docs.npmjs.com/cli/v9/commands/npm-audit)
- nestjs-boot source: `.github/workflows/ci.yml`, `examples/microservices/docker-compose.yml`
