# 12 - Deployment

Getting your app to production safely.

## Production Checklist

Before deploying, verify:

- [ ] Environment variables set (never hardcode secrets)
- [ ] `JWT_SECRET` is a strong random string (not `dev-secret-change-me`)
- [ ] `MONGO_URI` points to production database (with auth enabled)
- [ ] `REDIS_URL` points to production Redis
- [ ] Health check works: `curl http://your-app/health`
- [ ] Error handler is enabled (`response.errorHandler: true`)
- [ ] Logs are structured (use `logging` config for production pino logs)
- [ ] No `console.log` in production code (use NestJS Logger)

## Environment Variables

```bash
# Production .env (never commit this!)
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/prod
REDIS_URL=redis://:password@redis-host:6379
JWT_SECRET=a-very-long-random-string-at-least-32-characters
JWT_REFRESH_SECRET=another-very-long-random-string
```

## Docker Deployment

```bash
# Build production image
docker build -t myapp:v1.0.0 .

# Run with environment variables
docker run -d \
  --name myapp \
  -p 3000:3000 \
  --env-file .env.production \
  --restart unless-stopped \
  myapp:v1.0.0
```

## Graceful Shutdown

nestjs-boot supports graceful shutdown -- finishing in-flight requests before stopping:

```typescript
const app = await createApp(AppModule, {
  shutdown: {
    timeout: 30000,  // wait up to 30 seconds
    signals: ['SIGTERM', 'SIGINT'],
  },
});
```

This is critical in Kubernetes, where pods receive SIGTERM before being killed.

## Health Checks

Load balancers and orchestrators use health checks:

```
GET /health -> 200 { status: 'ok', checks: { mongodb: 'up', redis: 'up' } }
```

Configure in `main.ts`:

```typescript
health: { enabled: true, path: '/health' },
```

## What's Next?

You've completed the learning path. Here's where to go from here:

1. **Build something real** -- pick a project and use nestjs-boot
2. **Study the microservices example** -- `examples/microservices/` shows a 10-service architecture
3. **Read the nestjs-boot source** -- `src/` is well-documented
4. **Explore advanced features** -- tracing, metrics, circuit breakers, event bus

---

Congratulations on completing all 12 lessons!
