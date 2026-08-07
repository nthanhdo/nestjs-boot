# {{name}}

A NestJS microservice powered by [nestjs-boot](https://github.com/nthanhdo/nestjs-boot).

## Quick Start

```bash
# Start infrastructure
docker-compose up -d

# Start dev server with hot reload
npm run start:dev
```

Your service will be running at:
- **HTTP:** http://localhost:3000
- **Health:** http://localhost:3000/health

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start with hot reload |
| `npm run build` | Build for production |
| `npm run start:prod` | Run production build |
| `npm test` | Run tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run lint` | Lint and fix |

## Environment Variables

See `.env.example` for all available configuration. Copy it to `.env`:

```bash
cp .env.example .env
```

## Docker

### Development

```bash
docker-compose up -d
```

### Production

```bash
docker build -t {{name}} .
docker run -p 3000:3000 --env-file .env {{name}}
```

## Kubernetes

```bash
kubectl apply -f k8s/
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Hello endpoint |
| GET | `/health` | Health check |

## Project Structure

```
{{name}}/
  src/
    main.ts            # Application bootstrap
    app.module.ts      # Root module
    app.controller.ts  # Root controller
    app.service.ts     # Root service
  test/
    app.e2e-spec.ts    # E2E tests
  k8s/                 # Kubernetes manifests
  Dockerfile           # Multi-stage production build
  docker-compose.yml   # Local development infrastructure
```
