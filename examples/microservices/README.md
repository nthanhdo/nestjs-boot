# nestjs-boot Microservices Example

Ten interconnected microservices demonstrating `nestjs-boot`'s config-driven bootstrap with `createApp()`.

## Architecture

```
                         HTTP :3000
                            |
                    ┌───────┴───────┐
                    │  API Gateway  │
                    │  JWT + RBAC   │
                    │  Correlation  │
                    │  Rate Limit   │
                    └──┬──┬──┬──┬──┘
                       │  │  │  │
         ┌─────────────┼──┼──┼──┼─────────────┐
         │    ┌────────┘  │  │  └────────┐     │
         │    │    ┌──────┘  └──────┐    │     │
         ▼    ▼    ▼    ▼    ▼      ▼    ▼     ▼
       Auth  Prod  Ord  Notif File  Sched Blog  Fulfill Campaign
       :5001 :5002 :5003 :5004 :5005 :5006 :5007 :5008  :5009
```

All inter-service communication uses gRPC. The API Gateway is the only HTTP entry point.

## nestjs-boot Features Demonstrated

| Feature | Gateway | Auth | Product | Order | Notification | File | Scheduler | Blog | Fulfillment | Campaign |
|---------|:-------:|:----:|:-------:|:-----:|:------------:|:----:|:---------:|:----:|:-----------:|:--------:|
| `createApp()` | x | x | x | x | x | x | x | x | x | x |
| JWT Auth (`BootJwtService`) | x | x | | | | | | | | |
| Correlation ID | x | x | x | x | x | x | x | x | x | x |
| gRPC Client | x | | | | | | | | | |
| gRPC Server | | x | x | x | x | x | x | x | x | x |
| DatabaseModule | | x | x | x | x | x | x | x | x | x |
| CacheModule (L1+L2) | | | x | x | | | | x | x | x |
| HealthModule | x | x | x | x | x | x | x | x | x | x |
| Response Envelope | x | | | | | | | | | |
| Error Handler | | | | | x | x | x | x | x | x |
| EventBus (`@OnEvent`) | | | | | x | | | | x | x |
| Queue (`@Processor`) | | | | | x | | x | | x | |

## Quick Start

```bash
docker-compose up --build
```

This starts 12 containers (10 services + MongoDB + Redis):

| Service | HTTP | gRPC | Purpose |
|---------|------|------|---------|
| API Gateway | [:3000](http://localhost:3000) | - | HTTP entry point, JWT, routing |
| Auth Service | :3003 | :5001 | User registration, login, JWT tokens |
| Product Service | :3002 | :5002 | Product CRUD with L1+L2 cache |
| Order Service | :3001 | :5003 | Order management, triggers fulfillment |
| Notification Service | :3004 | :5004 | Event-driven notifications, BullMQ |
| File Service | :3005 | :5005 | File upload and storage |
| Scheduler Service | :3006 | :5006 | Cron-like scheduled jobs via BullMQ |
| Blog Service | :3007 | :5007 | Blog articles with Redis cache |
| Fulfillment Service | :3008 | :5008 | Order fulfillment pipeline, events + queue |
| Campaign Service | :3009 | :5009 | Promo campaigns with event-driven lifecycle |
| MongoDB | :27017 | - | Shared database engine |
| Redis | :6379 | - | Cache, queues, events |

## Try It

Complete walkthrough exercising all 10 services.

### 1. Register a user

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"123456","name":"Test User"}'
```

### 2. Login

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"123456"}' | jq -r '.data.accessToken')

echo $TOKEN
```

### 3. Create a product

```bash
curl -s -X POST http://localhost:3000/products \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Wireless Mouse","price":29.99,"category":"electronics","stock":150}'
```

### 4. List products

```bash
curl -s 'http://localhost:3000/products?category=electronics&page=1&limit=10'
```

### 5. Create a blog article

```bash
curl -s -X POST http://localhost:3000/blog/articles \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Getting Started with Microservices",
    "content": "This guide walks you through building a 10-service architecture...",
    "tags": ["microservices", "nestjs", "tutorial"],
    "authorId": "user-123"
  }'
```

### 6. Upload a file (cover image)

```bash
curl -s -X POST http://localhost:3000/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@./cover.png'
```

### 7. Create a campaign with promo code

```bash
curl -s -X POST http://localhost:3000/campaigns \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Summer Sale 2026",
    "promoCode": "SUMMER20",
    "discountPercent": 20,
    "startDate": "2026-08-01T00:00:00Z",
    "endDate": "2026-08-31T23:59:59Z"
  }'
```

### 8. Create an order with promo

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "userId": "user-123",
    "items": [{"productId": "<product-id>", "quantity": 2, "price": 29.99}],
    "promoCode": "SUMMER20"
  }'
```

This triggers the Fulfillment Service (picks up the order) and the Notification Service (sends confirmation).

### 9. Check fulfillment status

```bash
curl -s http://localhost:3000/fulfillment/orders/<order-id> \
  -H "Authorization: Bearer $TOKEN"
```

### 10. Check notifications

```bash
curl -s 'http://localhost:3000/notifications?userId=user-123'
```

### 11. Create a scheduled job

```bash
curl -s -X POST http://localhost:3000/scheduler/jobs \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "daily-report",
    "cron": "0 9 * * *",
    "handler": "generateDailyReport",
    "data": {"reportType": "sales"}
  }'
```

### 12. Health check all services

```bash
curl -s http://localhost:3000/health | jq
```

## Service Details

### API Gateway (port 3000)

HTTP entry point for all external requests. Routes to backend services via gRPC.

**nestjs-boot features:** JWT auth, correlation ID propagation, response envelope, gRPC clients (9 connections), health check.

**Key endpoints:**
- `POST /auth/register` — proxy to Auth Service
- `POST /auth/login` — proxy to Auth Service
- `GET/POST /products` — proxy to Product Service
- `GET/POST /orders` — proxy to Order Service
- `GET /notifications` — proxy to Notification Service
- `POST /files/upload` — proxy to File Service
- `GET/POST /blog/articles` — proxy to Blog Service
- `GET/POST /campaigns` — proxy to Campaign Service
- `GET /fulfillment/orders/:id` — proxy to Fulfillment Service
- `GET/POST /scheduler/jobs` — proxy to Scheduler Service
- `GET /health` — aggregated health

### Auth Service (HTTP :3003, gRPC :5001)

User registration and login with password hashing and JWT tokens.

**nestjs-boot features:** `createApp()`, DatabaseModule, `BootJwtService` (access + refresh tokens), correlation ID, health check.

**Key gRPC methods:** `Register`, `Login`, `ValidateToken`, `RefreshToken`

### Product Service (HTTP :3002, gRPC :5002)

Product CRUD with manual cache-aside pattern. L1 in-memory + L2 Redis. Cache HIT/MISS logging.

**nestjs-boot features:** `createApp()`, DatabaseModule, CacheModule (L1+L2), gRPC server, correlation ID, health check.

**Key gRPC methods:** `CreateProduct`, `GetProduct`, `ListProducts`, `UpdateProduct`, `DeleteProduct`

### Order Service (HTTP :3001, gRPC :5003)

Order management with MongoDB and Redis cache.

**nestjs-boot features:** `createApp()`, DatabaseModule, CacheModule, gRPC server, correlation ID, health check.

**Key gRPC methods:** `CreateOrder`, `GetOrder`, `ListOrders`

### Notification Service (HTTP :3004, gRPC :5004)

Event-driven notification processing. Listens for `OrderCreatedEvent` via EventBus, enqueues notification jobs via BullMQ, processes asynchronously.

**nestjs-boot features:** `createApp()`, DatabaseModule, EventBus (`@OnEvent`), Queue (`@Processor`/`@Process`), gRPC server, correlation ID, health check.

**Key gRPC methods:** `GetNotifications`, `MarkAsRead`

### File Service (HTTP :3005, gRPC :5005)

File upload and storage with metadata persistence in MongoDB. Uploaded files stored on disk (volume-mounted).

**nestjs-boot features:** `createApp()`, DatabaseModule, gRPC server, correlation ID, health check.

**Key gRPC methods:** `UploadFile`, `GetFile`, `DeleteFile`

### Scheduler Service (HTTP :3006, gRPC :5006)

Cron-like job scheduling. Persists job definitions in MongoDB, executes via BullMQ repeatable jobs with retry and backoff.

**nestjs-boot features:** `createApp()`, DatabaseModule, CacheModule, Queue (BullMQ with repeatable jobs), gRPC server, correlation ID, health check.

**Key gRPC methods:** `CreateJob`, `GetJob`, `ListJobs`, `PauseJob`, `ResumeJob`, `DeleteJob`

### Blog Service (HTTP :3007, gRPC :5007)

Blog article management with Redis-cached reads.

**nestjs-boot features:** `createApp()`, DatabaseModule, CacheModule (L2 Redis, 300s TTL), gRPC server, correlation ID, health check.

**Key gRPC methods:** `CreateArticle`, `GetArticle`, `ListArticles`, `UpdateArticle`, `DeleteArticle`

### Fulfillment Service (HTTP :3008, gRPC :5008)

Order fulfillment pipeline. Listens for order events via EventBus, processes fulfillment steps via BullMQ queue, caches status in Redis.

**nestjs-boot features:** `createApp()`, DatabaseModule, CacheModule (60s TTL), EventBus (Redis), Queue (BullMQ), gRPC server, correlation ID, health check.

**Key gRPC methods:** `GetFulfillmentStatus`, `UpdateFulfillmentStatus`

### Campaign Service (HTTP :3009, gRPC :5009)

Promo campaign management with event-driven lifecycle. Creates/validates promo codes, emits campaign events.

**nestjs-boot features:** `createApp()`, DatabaseModule, CacheModule (300s TTL), EventBus (Redis), gRPC server, correlation ID, health check.

**Key gRPC methods:** `CreateCampaign`, `GetCampaign`, `ValidatePromoCode`, `ListCampaigns`

## Project Structure

```
examples/microservices/
├── proto/                        # Shared protobuf definitions
│   ├── auth.proto
│   ├── blog.proto
│   ├── campaign.proto
│   ├── file.proto
│   ├── fulfillment.proto
│   ├── notification.proto
│   ├── order.proto
│   ├── product.proto
│   └── scheduler.proto
├── api-gateway/                  # HTTP entry point
│   └── src/
│       ├── main.ts               # createApp() with auth + 9 gRPC clients
│       ├── auth/                 # REST controller + gRPC proxy
│       ├── product/              # REST controller + gRPC proxy
│       ├── order/                # REST controller + gRPC proxy
│       ├── notification/         # REST controller + gRPC proxy
│       ├── file/                 # REST controller + gRPC proxy
│       ├── blog/                 # REST controller + gRPC proxy
│       ├── campaign/             # REST controller + gRPC proxy
│       ├── fulfillment/          # REST controller + gRPC proxy
│       └── scheduler/            # REST controller + gRPC proxy
├── auth-service/                 # gRPC backend — JWT auth
├── product-service/              # gRPC backend — L1+L2 cache
├── order-service/                # gRPC backend — orders
├── notification-service/         # gRPC backend — events + queue
├── file-service/                 # gRPC backend — file upload
├── scheduler-service/            # gRPC backend — cron jobs via BullMQ
├── blog-service/                 # gRPC backend — articles + Redis cache
├── fulfillment-service/          # gRPC backend — order fulfillment pipeline
├── campaign-service/             # gRPC backend — promo campaigns + events
└── docker-compose.yml            # Full stack: 10 services + MongoDB + Redis
```
