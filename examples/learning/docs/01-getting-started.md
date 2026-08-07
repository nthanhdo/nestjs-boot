# 01 - Getting Started

In this lesson, you'll get the learning project running locally.

## Setup

```bash
# 1. Navigate to the learning project
cd examples/learning

# 2. Install dependencies
npm install

# 3. Start MongoDB and Redis (in Docker)
docker-compose up -d

# 4. Copy the environment config
cp .env.example .env

# 5. Start the development server (with hot-reload)
npm run start:dev
```

You should see output like:

```
Learning Server running on port 3000
Health check:  http://localhost:3000/health
Products:      http://localhost:3000/products
```

## Try It Yourself

Open another terminal and run:

```bash
# Check that the server is healthy
curl http://localhost:3000/health
# -> { "status": "ok", "checks": { "mongodb": "up", "redis": "up" } }

# List products (empty at first)
curl http://localhost:3000/products
# -> { "items": [], "total": 0, "page": 1, "limit": 20 }

# Create a product
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Wireless Mouse","price":29.99,"stock":100}'

# List products again
curl http://localhost:3000/products
# -> { "items": [{ "_id": "...", "name": "Wireless Mouse", ... }], "total": 1, ... }
```

## What's Happening Under the Hood

When you ran `npm run start:dev`, this happened:

1. **ts-node-dev** compiled your TypeScript to JavaScript
2. **main.ts** called `createApp()` from nestjs-boot
3. `createApp()` validated your config, then dynamically built NestJS modules for database, cache, auth, and health
4. NestJS created your controllers and services (Dependency Injection)
5. The HTTP server started listening on port 3000

Open `src/main.ts` and read the comments -- every line is explained.

## Project Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Entry point -- configures and starts the app |
| `src/app.module.ts` | Root module -- registers features |
| `docker-compose.yml` | MongoDB + Redis containers |
| `.env` | Environment variables (secrets, connection strings) |
| `tsconfig.json` | TypeScript compiler settings |

## Stopping

```bash
# Stop the dev server: Ctrl+C

# Stop Docker containers
docker-compose down

# To wipe all data and start fresh:
docker-compose down -v
```

---

Next: [02 - Understanding NestJS](02-understanding-nestjs.md)
