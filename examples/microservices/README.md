# nestjs-boot Microservices Example

Three interconnected microservices demonstrating `nestjs-boot`'s `createApp()` config-driven bootstrap.

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
               └──┬─────────┬──┘
          gRPC    │         │    gRPC
         :5001    │         │   :5002
       ┌──────────┘         └──────────┐
       │                               │
┌──────┴───────┐               ┌───────┴──────┐
│Order Service │               │Product Svc   │
│ (nestjs-boot)│               │ (nestjs-boot)│
│ - MongoDB    │               │ - MongoDB    │
│ - Redis cache│               │ - Redis L1+L2│
│ - gRPC server│               │ - gRPC server│
│ - Correlation│               │ - Cache-aside│
│ - Health     │               │ - Health     │
└──────┬───┬───┘               └───────┬──┬───┘
       │   │                           │  │
   ┌───┘   └───┐                   ┌───┘  └───┐
   ▼           ▼                   ▼          ▼
MongoDB     Redis               MongoDB    Redis
:27017      :6379               :27017     :6379
```

## nestjs-boot Features Demonstrated

| Feature | API Gateway | Order Service | Product Service |
|---------|:-----------:|:-------------:|:---------------:|
| `createApp()` | x | x | x |
| JWT Auth | x | | |
| Correlation ID | x | x | x |
| gRPC Client | x | | |
| gRPC Server | | x | x |
| DatabaseModule | | x | x |
| CacheModule (L1+L2) | | | x |
| HealthModule | x | x | x |
| Response Envelope | x | | |
| AllExceptionsFilter | x | x | x |

## Quick Start

```bash
docker-compose up --build
```

## API Endpoints

### Products

```bash
# Create a product
curl -X POST http://localhost:3000/products \
  -H 'Content-Type: application/json' \
  -d '{"name": "Wireless Mouse", "price": 29.99, "category": "electronics", "stock": 150}'

# Get a product by ID
curl http://localhost:3000/products/<id>

# List products (with optional category filter)
curl 'http://localhost:3000/products?category=electronics&page=1&limit=10'
```

### Orders

```bash
# Create an order
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "user-123",
    "items": [
      {"productId": "<product-id>", "quantity": 2, "price": 29.99}
    ]
  }'

# Get an order by ID
curl http://localhost:3000/orders/<id>

# Get orders by user
curl 'http://localhost:3000/orders?userId=user-123'
```

### Health

```bash
# Each service exposes /health
curl http://localhost:3000/health   # API Gateway
curl http://localhost:3001/health   # Order Service
curl http://localhost:3002/health   # Product Service
```

## How It Works

Each service's `main.ts` calls `createApp(AppModule, options)` with a declarative config object. `nestjs-boot` auto-wires:

1. **API Gateway** -- HTTP-only service with JWT auth, gRPC client proxies to downstream services, correlation ID propagation, and unified response envelope wrapping all responses in `{ success, data, error }`.

2. **Order Service** -- gRPC server receiving requests from the gateway. Uses `DatabaseModule` for MongoDB (writer connection) and `CacheModule` with Redis. Mongoose schemas with proper indexing and validation.

3. **Product Service** -- gRPC server with manual cache-aside pattern on top of `CacheModule` (L1 in-memory + L2 Redis). Demonstrates cache HIT/MISS logging and TTL-based invalidation.

## Project Structure

```
examples/microservices/
├── proto/                    # Shared protobuf definitions
│   ├── order.proto
│   └── product.proto
├── api-gateway/              # HTTP entry point
│   └── src/
│       ├── main.ts           # createApp() with auth + transport clients
│       ├── order/            # REST controller + gRPC gateway proxy
│       └── product/          # REST controller + gRPC gateway proxy
├── order-service/            # gRPC backend
│   └── src/
│       ├── main.ts           # createApp() with database + cache + gRPC server
│       ├── order.controller  # @GrpcMethod handlers
│       ├── order.service     # Business logic + MongoDB
│       └── schemas/          # Mongoose schema definitions
├── product-service/          # gRPC backend with caching
│   └── src/
│       ├── main.ts           # createApp() with database + cache + gRPC server
│       ├── product.controller
│       ├── product.service   # Cache-aside with CACHE_SERVICE
│       └── schemas/
└── docker-compose.yml        # Full stack: 3 services + MongoDB + Redis
```
