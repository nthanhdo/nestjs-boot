export interface Lesson {
  id: number;
  title: string;
  description: string;
  duration: string;
  content: string;
}

export const lessons: Lesson[] = [
  {
    id: 1,
    title: "Getting Started",
    description: "Install nestjs-boot and create your first project",
    duration: "10 min",
    content: `# Getting Started with nestjs-boot

## Prerequisites
- Node.js 20+
- npm or pnpm

## Installation

\`\`\`bash
npx nestjs-boot my-project
\`\`\`

This will scaffold a production-ready NestJS project with:
- TypeScript configuration
- Health checks
- Docker support
- Testing setup

## Your First Service

\`\`\`typescript
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {
    health: { enabled: true },
  });
  await app.listen(3000);
}
bootstrap();
\`\`\`

## Run It

\`\`\`bash
npm run start:dev
# Visit http://localhost:3000
# Health: http://localhost:3000/health
\`\`\``,
  },
  {
    id: 2,
    title: "Database Setup",
    description: "Connect MongoDB, PostgreSQL, or MySQL",
    duration: "15 min",
    content: `# Database Setup

## MongoDB (Mongoose)

\`\`\`typescript
const app = await createApp(AppModule, {
  database: {
    connections: {
      master: {
        writerUri: 'mongodb://localhost:27017/myapp',
      },
    },
  },
});
\`\`\`

## PostgreSQL (TypeORM)

\`\`\`typescript
const app = await createApp(AppModule, {
  database: {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    username: 'postgres',
    password: 'postgres',
  },
});
\`\`\`

## Reader/Writer Split

nestjs-boot supports read replicas out of the box:

\`\`\`typescript
database: {
  connections: {
    master: {
      writerUri: 'mongodb://primary:27017/myapp',
      readerUri: 'mongodb://secondary:27017/myapp',
    },
  },
}
\`\`\``,
  },
  {
    id: 3,
    title: "Caching",
    description: "Add Redis or Memcached caching",
    duration: "10 min",
    content: `# Caching

## Redis Cache

\`\`\`typescript
const app = await createApp(AppModule, {
  cache: {
    redis: { url: 'redis://localhost:6379' },
  },
});
\`\`\`

## Using the Cache

\`\`\`typescript
import { Injectable } from '@nestjs/common';
import { CacheService } from 'nestjs-boot';

@Injectable()
export class ProductService {
  constructor(private cache: CacheService) {}

  async getProduct(id: string) {
    const cached = await this.cache.get(\`product:\${id}\`);
    if (cached) return cached;

    const product = await this.db.findById(id);
    await this.cache.set(\`product:\${id}\`, product, 3600);
    return product;
  }
}
\`\`\``,
  },
  {
    id: 4,
    title: "Authentication",
    description: "JWT auth with guards and decorators",
    duration: "15 min",
    content: `# Authentication

## JWT Setup

\`\`\`typescript
const app = await createApp(AppModule, {
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET || 'change-me',
    },
  },
});
\`\`\`

## Protecting Routes

\`\`\`typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'nestjs-boot';

@Controller('users')
export class UsersController {
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user) {
    return user;
  }
}
\`\`\``,
  },
  {
    id: 5,
    title: "Microservice Transport",
    description: "gRPC, TCP, NATS, and RabbitMQ",
    duration: "20 min",
    content: `# Microservice Transport

## gRPC

\`\`\`typescript
const app = await createApp(AppModule, {
  transport: {
    grpc: {
      url: '0.0.0.0:5000',
      package: 'orders',
      protoPath: join(__dirname, '../proto/orders.proto'),
    },
  },
});
\`\`\`

## NATS (Pub/Sub)

\`\`\`typescript
const app = await createApp(AppModule, {
  transport: {
    nats: {
      url: 'nats://localhost:4222',
    },
  },
});
\`\`\`

## Message Patterns

\`\`\`typescript
@MessagePattern('order.created')
handleOrderCreated(data: OrderDto) {
  return this.service.processOrder(data);
}
\`\`\``,
  },
  {
    id: 6,
    title: "Health Checks",
    description: "Production health endpoints",
    duration: "8 min",
    content: `# Health Checks

Health checks are enabled by default with nestjs-boot.

## Default Endpoint

\`\`\`
GET /health
\`\`\`

Response:
\`\`\`json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
\`\`\`

## Custom Health Indicators

\`\`\`typescript
@Injectable()
export class PaymentHealthIndicator extends HealthIndicator {
  async isHealthy() {
    const isUp = await this.checkPaymentGateway();
    return this.getStatus('payment', isUp);
  }
}
\`\`\``,
  },
  {
    id: 7,
    title: "Docker & Compose",
    description: "Containerize your service",
    duration: "12 min",
    content: `# Docker & Docker Compose

nestjs-boot generates production-ready Docker files.

## Multi-stage Dockerfile

\`\`\`dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
\`\`\`

## Docker Compose

\`\`\`bash
docker-compose up -d
\`\`\`

This starts your app + all infrastructure (DB, cache, etc.).`,
  },
  {
    id: 8,
    title: "Testing",
    description: "Unit and E2E testing with Vitest",
    duration: "15 min",
    content: `# Testing

## Unit Tests

\`\`\`typescript
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AppService],
    }).compile();
    service = module.get(AppService);
  });

  it('should return hello', () => {
    expect(service.getHello()).toHaveProperty('message');
  });
});
\`\`\`

## E2E Tests

\`\`\`typescript
import * as request from 'supertest';

it('GET /health', () => {
  return request(app.getHttpServer())
    .get('/health')
    .expect(200);
});
\`\`\`

## Run Tests

\`\`\`bash
npm test          # Run once
npm run test:watch # Watch mode
npm run test:cov  # Coverage
\`\`\``,
  },
  {
    id: 9,
    title: "Kubernetes",
    description: "Deploy to K8s with generated manifests",
    duration: "15 min",
    content: `# Kubernetes Deployment

## Generated Manifests

nestjs-boot generates:
- \`k8s/deployment.yaml\` - Pod spec with health probes
- \`k8s/service.yaml\` - ClusterIP service
- \`k8s/configmap.yaml\` - Environment config
- \`k8s/hpa.yaml\` - Horizontal Pod Autoscaler

## Deploy

\`\`\`bash
kubectl apply -f k8s/
\`\`\`

## Health Probes

\`\`\`yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 15
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
\`\`\``,
  },
  {
    id: 10,
    title: "Resilience Patterns",
    description: "Circuit breaker, retry, rate limiting",
    duration: "15 min",
    content: `# Resilience Patterns

## Circuit Breaker

\`\`\`typescript
@Injectable()
export class PaymentService {
  @CircuitBreaker({ timeout: 3000, errorThreshold: 50 })
  async processPayment(order: Order) {
    return this.gateway.charge(order);
  }
}
\`\`\`

## Retry with Backoff

\`\`\`typescript
@Retry({ maxAttempts: 3, delay: 1000, backoff: 'exponential' })
async fetchExternalData() {
  return this.httpService.get('/api/data');
}
\`\`\`

## Rate Limiting

\`\`\`typescript
@Controller('api')
@UseGuards(RateLimiterGuard)
@RateLimit({ windowMs: 60000, max: 100 })
export class ApiController {}
\`\`\``,
  },
  {
    id: 11,
    title: "Event-Driven Architecture",
    description: "Event bus, CQRS, and queues",
    duration: "20 min",
    content: `# Event-Driven Architecture

## Domain Events

\`\`\`typescript
@Injectable()
export class OrderService {
  constructor(private eventBus: EventBusService) {}

  async createOrder(dto: CreateOrderDto) {
    const order = await this.orderRepo.save(dto);
    this.eventBus.emit('order.created', order);
    return order;
  }
}

@OnEvent('order.created')
handleOrderCreated(order: Order) {
  // Send confirmation email, update inventory, etc.
}
\`\`\`

## Background Jobs (Bull)

\`\`\`typescript
@Processor('email')
export class EmailProcessor {
  @Process('send')
  async handleSend(job: Job<EmailData>) {
    await this.mailer.send(job.data);
  }
}
\`\`\``,
  },
  {
    id: 12,
    title: "Production Checklist",
    description: "Go live with confidence",
    duration: "10 min",
    content: `# Production Checklist

## Before Deploy

- [ ] Health endpoint returns 200
- [ ] All env vars documented in .env.example
- [ ] Docker build succeeds
- [ ] All tests pass
- [ ] Logging is structured (JSON)
- [ ] Secrets are NOT hardcoded

## Infrastructure

- [ ] Database connection pooling configured
- [ ] Redis/Cache TTL set appropriately
- [ ] Rate limiting enabled
- [ ] CORS configured
- [ ] Helmet security headers

## Monitoring

- [ ] /health endpoint monitored
- [ ] /metrics exposed for Prometheus
- [ ] Distributed tracing configured
- [ ] Error alerting set up

## Kubernetes

- [ ] Resource limits set
- [ ] HPA configured
- [ ] Liveness/readiness probes
- [ ] Pod disruption budget
- [ ] Network policies`,
  },
];
