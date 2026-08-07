# Cold Start & Serverless Considerations

## TL;DR

**nestjs-boot is designed for long-running microservices (Docker/K8s), not serverless FaaS.**

If you are building for AWS Lambda, Google Cloud Functions, or any other invocation-per-request
runtime, read this guide before committing to nestjs-boot.

---

## Why nestjs-boot is NOT serverless-optimized

`createApp()` eagerly initializes all configured modules:

```
[boot] Config validation      ~12ms
[boot] OTel init (if enabled) ~45–300ms
[boot] NestFactory.create()   ~250–400ms   ← DI container + all module inits
[boot] DB connection pool     ~100–500ms   ← MongoDB/Postgres connect
[boot] Redis connect          ~50–200ms
[boot] Transport bind         ~20–100ms
[boot] Total                  ~500–1500ms
```

On a long-running server, this startup cost is amortized over millions of requests.
On Lambda with cold start per invocation, **this hits every single time** — including
for workloads that only process one event per minute.

Community benchmarks (2024, 512MB Lambda):
- NestJS cold start: **1.2–1.8s**
- Express (minimal): 50–150ms
- Hono (Edge-native): <50ms
- Fastify: 80–200ms

---

## When to use nestjs-boot

nestjs-boot is the right choice when:

- Your service runs as a long-lived container (Docker, K8s, ECS, Cloud Run with min-instances ≥ 1)
- You need MongoDB + Redis + OTel + Prometheus + gRPC all wired together automatically
- Your team values DX (no boilerplate) over cold start latency
- You have predictable, sustained traffic

---

## When NOT to use nestjs-boot

Consider alternatives when:

| Scenario | Recommended alternative |
|---|---|
| AWS Lambda with cold start sensitivity | [Hono](https://hono.dev) or plain Express |
| Vercel / Netlify Edge Functions | Hono (Edge runtime, no Node.js DI) |
| Google Cloud Functions (min=0) | [Fastify](https://fastify.dev) |
| Lightweight event processing (SQS, SNS) | Plain Node.js handler with `@nestjs/core` standalone |
| Short-lived scripts / CLI tools | Plain Node.js or Commander.js |

---

## If you MUST use nestjs-boot on Lambda

If your team has committed to NestJS DI and needs to run on Lambda anyway,
here are techniques to reduce cold start:

### 1. Enable the `lazy` boot option (defer DB/cache connections)

```ts
const app = await createApp(AppModule, {
  database: { connections: { master: { writerUri: process.env.MONGO_URI! } } },
  cache: { redis: { url: process.env.REDIS_URL! } },
  lazy: true,  // ← DB and cache connect on first use, not at boot
});
```

**Trade-off:** the first request is slower (connection established on demand).
Subsequent requests in the same Lambda instance are fast (connection reused).
Cold start improvement: ~40–60% (300–800ms saved).

### 2. Use NestJS `LazyModuleLoader` for optional heavy modules

For modules that are rarely used (e.g., reporting, batch processing):

```ts
import { LazyModuleLoader } from '@nestjs/core';

@Injectable()
export class ReportService {
  constructor(private readonly lazyModuleLoader: LazyModuleLoader) {}

  async generateReport() {
    // Heavy ReportModule only loads on first call — not at bootstrap
    const { ReportModule } = await import('./report/report.module');
    const moduleRef = await this.lazyModuleLoader.load(() => ReportModule);
    const reportGenerator = moduleRef.get(ReportGenerator);
    return reportGenerator.run();
  }
}
```

See: https://docs.nestjs.com/fundamentals/lazy-loading-modules

### 3. Use `@vendia/serverless-express` adapter

```ts
// src/lambda.ts
import { NestFactory } from '@nestjs/core';
import serverlessExpress from '@vendia/serverless-express';
import { AppModule } from './app.module';
import { createApp } from 'nestjs-boot';

let cachedApp: any;

async function bootstrap() {
  if (cachedApp) return cachedApp;
  const app = await createApp(AppModule, {
    lazy: true,  // defer connections
    // ... your options
  });
  await app.init();
  cachedApp = serverlessExpress({ app: app.getHttpAdapter().getInstance() });
  return cachedApp;
}

export const handler = async (event: any, context: any) => {
  const app = await bootstrap();
  return app(event, context);
};
```

**Note:** `@vendia/serverless-express` wraps the NestJS HTTP adapter — it does NOT fix
the DI cold start. It only handles the Lambda event → HTTP request translation.

### 4. Keep the Lambda warm

For predictable workloads, use EventBridge or a CloudWatch rule to ping the Lambda
every 5 minutes. This keeps the container warm and avoids cold starts for most requests.
This is not a fix — it's a workaround with cost implications.

---

## Startup Time Profiler (dev mode)

nestjs-boot includes a startup profiler that logs time spent in each `createApp` phase.
Enable it in development to identify slow modules:

```ts
// src/main.ts
const app = await createApp(AppModule, {
  // ...
});
// Profiler output appears in logs before the app starts listening
```

Sample output (dev mode only, disabled in production):
```
[boot] Config validation: 12ms
[boot] OTel init: 45ms
[boot] NestFactory.create: 340ms
[boot] DB connect: 120ms
[boot] Total: 517ms
```

---

## Summary

| nestjs-boot | Long-running service ✅ | Serverless ⚠️ |
|---|---|---|
| DX (zero boilerplate) | Excellent | Acceptable |
| Cold start | N/A (always warm) | 500–1500ms |
| `lazy: true` cold start | N/A | 200–600ms |
| Infrastructure coverage | Full | Full (but wasteful) |
| Recommended | Yes | Only if team committed to NestJS DI |
