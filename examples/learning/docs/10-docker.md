# 10 - Docker

Docker packages your app + its dependencies into a container that runs identically everywhere.

## Why Docker?

"Works on my machine" -- Docker eliminates this. Your app runs in the same environment in development, CI, staging, and production.

## The Dockerfile

This project uses a multi-stage build (see `Dockerfile`):

```dockerfile
# Stage 1: Build TypeScript
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Run (production only)
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev       # no devDependencies
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**Why multi-stage?** The builder stage has TypeScript, ts-node, jest, etc. The production image only has compiled JavaScript + production dependencies. Result: smaller image, faster deploys, reduced attack surface.

## docker-compose.yml

Compose defines multiple services that work together:

```yaml
services:
  mongodb:
    image: mongo:7
    ports: ['27017:27017']

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
```

## Commands

```bash
# Start infrastructure (MongoDB + Redis)
docker-compose up -d

# Build your app image
docker build -t learning-app .

# Run your app in Docker
docker run -p 3000:3000 \
  -e MONGO_URI=mongodb://host.docker.internal:27017/learning \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  learning-app

# Check running containers
docker ps

# View logs
docker logs <container-id>

# Stop everything
docker-compose down
```

## Try It Yourself

```bash
# Build the image
docker build -t learning-app .

# Check the image size
docker images learning-app

# Run it (assuming docker-compose services are up)
docker run --rm -p 3001:3000 \
  -e MONGO_URI=mongodb://host.docker.internal:27017/learning \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  learning-app

# Test it
curl http://localhost:3001/health
```

## Exercise

Try [Exercise 10: Deploy to Docker](../exercises/10-deploy-to-docker.md)

---

Next: [11 - Microservices](11-microservices.md)
