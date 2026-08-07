# Exercise 10: Build and Run in Docker

**Objective:** Containerize the learning project and run it alongside MongoDB and Redis using Docker Compose.

## Context

Docker ensures your app runs the same way everywhere. This exercise adds your app as a service in docker-compose.yml alongside the infrastructure.

## Steps

1. **Edit `docker-compose.yml`** to add your app:

```yaml
services:
  app:
    build: .
    ports:
      - '3000:3000'
    depends_on:
      - mongodb
      - redis
    environment:
      MONGO_URI: mongodb://mongodb:27017/learning
      REDIS_URL: redis://redis:6379
      JWT_SECRET: docker-secret-change-in-production
      JWT_REFRESH_SECRET: docker-refresh-secret
      PORT: '3000'

  mongodb:
    image: mongo:7
    ports:
      - '27017:27017'
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  mongo-data:
```

2. **Build and run:**

```bash
# Build and start everything
docker-compose up --build -d

# Check logs
docker-compose logs -f app

# Test
curl http://localhost:3000/health
```

3. **Verify the full flow works:**

```bash
# Create a product
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Docker Product","price":42,"stock":10}'

# List products
curl http://localhost:3000/products

# Check health (MongoDB + Redis should be "up")
curl http://localhost:3000/health
```

## Hints

- Inside Docker Compose, services reference each other by service NAME, not localhost
  - `mongodb://mongodb:27017` (not `mongodb://localhost:27017`)
  - `redis://redis:6379` (not `redis://localhost:6379`)
- `depends_on` ensures MongoDB and Redis start before your app
- Use `docker-compose logs app` to debug startup issues

## How to Verify

- `docker-compose up --build` completes without errors
- `curl http://localhost:3000/health` returns `{ status: 'ok' }`
- Products CRUD works through the Docker container
- Data persists across `docker-compose restart` (because of the volume)

## Solution

Stuck? See [solutions/10-solution/](../solutions/10-solution/)
