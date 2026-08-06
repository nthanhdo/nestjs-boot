# nestjs-boot Microservices Example

Four interconnected microservices demonstrating `nestjs-boot`'s config-driven bootstrap with `createApp()`.

## Architecture

```
                         HTTP :3000
                            |
                    ┌───────┴───────┐
                    │  API Gateway  │
                    │  (nestjs-boot)│
                    │  - JWT Auth   │
                    │  - Correlation│
                    │  - Response   │
                    │    Envelope   │
                    └─┬──┬──┬──┬───┘
                      │  │  │  │
         ┌────────────┘  │  │  └────────────┐
         │        ┌──────┘  └──────┐        │
         │ gRPC   │ gRPC    gRPC   │ gRPC   │
         │ :5001  │ :5002   :5003  │ :5004  │
         ▼        ▼                ▼        ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
   │  Auth    │ │ Product  │ │  Order   │ │ Notification │
   │ Service  │ │ Service  │ │ Service  │ │   Service    │
   │          │ │          │ │          │ │              │
   │ MongoDB  │ │ MongoDB  │ │ MongoDB  │ │ MongoDB      │
   │ JWT      │ │ Redis L2 │ │ Redis    │ │ EventBus     │
   │ bcrypt   │ │ Cache    │ │ Cache    │ │ BullMQ Queue │
   └────┬─────┘ └──┬───┬──┘ └──┬───┬──┘ └──┬───┬───────┘
        │          │   │       │   │       │   │
        ▼          ▼   ▼       ▼   ▼       ▼   ▼
      MongoDB    MongoDB Redis  MongoDB Redis  MongoDB Redis
      :27017     :27017 :6379  :27017 :6379   :27017 :6379
```

## nestjs-boot Features Demonstrated

| Feature | API Gateway | Auth | Product | Order | Notification |
|---------|:-----------:|:----:|:-------:|:-----:|:------------:|
| `createApp()` | x | x | x | x | x |
| JWT Auth (`BootJwtService`) | x | x | | | |
| Correlation ID | x | x | x | x | x |
| gRPC Client | x | | | | |
| gRPC Server | | x | x | x | x |
| DatabaseModule | | x | x | x | x |
| CacheModule (L1+L2) | | | x | x | |
| HealthModule | x | x | x | x | x |
| Response Envelope | x | | | | |
| EventBus (`@OnEvent`) | | | | | x |
| Queue (`@Processor`) | | | | | x |

## Quick Start

```bash
docker-compose up --build
```

This starts 6 containers:

| Service | HTTP | gRPC |
|---------|------|------|
| API Gateway | [:3000](http://localhost:3000) | - |
| Auth Service | :3003 | :5001 |
| Product Service | :3002 | :5002 |
| Order Service | :3001 | :5003 |
| Notification Service | :3004 | :5004 |
| MongoDB | :27017 | - |
| Redis | :6379 | - |

## Try It

### 1. Register a user

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"123456","name":"Test User"}'
```

### 2. Login

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"123456"}'
```

Save the `accessToken` from the response.

### 3. Create a product

```bash
curl -s -X POST http://localhost:3000/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Wireless Mouse","price":29.99,"category":"electronics","stock":150}'
```

### 4. List products

```bash
curl -s 'http://localhost:3000/products?category=electronics&page=1&limit=10'
```

### 5. Create an order

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "user-123",
    "items": [{"productId": "<product-id>", "quantity": 2, "price": 29.99}]
  }'
```

### 6. Check notifications

```bash
curl -s 'http://localhost:3000/notifications?userId=user-123'
```

### 7. Health checks

```bash
curl http://localhost:3000/health
```

## How It Works

Each service's `main.ts` calls `createApp(AppModule, options)` with a declarative config object. `nestjs-boot` auto-wires everything:

1. **API Gateway** -- HTTP entry point. Routes requests to internal gRPC services. JWT validation, correlation ID propagation, unified response envelope.

2. **Auth Service** -- User registration and login. Uses `BootJwtService` from nestjs-boot for JWT signing/verification with separate access and refresh tokens. Passwords hashed with bcrypt.

3. **Product Service** -- CRUD with manual cache-aside pattern on `CacheModule` (L1 in-memory + L2 Redis). Cache HIT/MISS logging and TTL-based invalidation.

4. **Order Service** -- Order management with MongoDB + Redis cache.

5. **Notification Service** -- Event-driven. Listens for `OrderCreatedEvent` via nestjs-boot's `EventBus` (`@OnEvent` decorator). Enqueues notification jobs via `QueueService` (BullMQ). Processes jobs asynchronously with `@Processor`/`@Process` decorators. Stores notification history in MongoDB.

## Project Structure

```
examples/microservices/
├── proto/                        # Shared protobuf definitions
│   ├── auth.proto
│   ├── order.proto
│   ├── product.proto
│   └── notification.proto
├── api-gateway/                  # HTTP entry point
│   └── src/
│       ├── main.ts               # createApp() with auth + transport clients
│       ├── auth/                 # REST controller + gRPC gateway proxy
│       ├── order/                # REST controller + gRPC gateway proxy
│       ├── product/              # REST controller + gRPC gateway proxy
│       └── notification/         # REST controller + gRPC gateway proxy
├── auth-service/                 # gRPC backend — JWT auth
│   └── src/
│       ├── main.ts               # createApp() with database + auth JWT
│       ├── auth.controller.ts    # @GrpcMethod handlers
│       ├── auth.service.ts       # BootJwtService + bcrypt
│       └── schemas/user.schema   # email, passwordHash, roles, refreshToken
├── order-service/                # gRPC backend
│   └── src/
│       ├── main.ts               # createApp() with database + cache + gRPC
│       ├── order.controller.ts
│       ├── order.service.ts
│       └── schemas/
├── product-service/              # gRPC backend with caching
│   └── src/
│       ├── main.ts               # createApp() with database + cache + gRPC
│       ├── product.controller.ts
│       ├── product.service.ts    # Cache-aside with CACHE_SERVICE
│       └── schemas/
├── notification-service/         # gRPC + event-driven
│   └── src/
│       ├── main.ts               # createApp() with database + events + queue
│       ├── notification.controller.ts
│       ├── notification.service.ts  # @Processor + @Process job handlers
│       ├── handlers/
│       │   └── order-created.handler.ts  # @OnEvent(OrderCreatedEvent)
│       └── schemas/
└── docker-compose.yml            # Full stack: 5 services + MongoDB + Redis
```
