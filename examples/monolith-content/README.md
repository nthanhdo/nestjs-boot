# Monolith Content Example

A monolith NestJS project using **nestjs-boot** with the **Content Service** (Headless CMS) module.

## What's included

| Module | Description |
|--------|-------------|
| **Content Service** | Headless CMS — content types, entries, localization (EN/VI), publishing workflow, webhooks |
| **Pages** | Business module that consumes published content entries |
| **Notifications** | Business module that reacts to content events |
| **Auth** | JWT authentication |
| **Cache** | Redis L2 cache (optional) |
| **Swagger** | OpenAPI docs at `/api` |
| **Health** | Health check at `/health` |

## Quick start

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
npm install

# 3. Setup database
cp .env.example .env
npx prisma db push

# 4. Seed sample content
npm run db:seed

# 5. Run
npm run start:dev
```

## API endpoints

### Content Management API (requires JWT)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/content/types` | Create content type |
| `GET` | `/api/content/types` | List content types |
| `POST` | `/api/content/entries` | Create entry |
| `PATCH` | `/api/content/entries/:id/publish` | Publish entry |

### Content Delivery API (requires API key)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/delivery/:contentType` | List published entries |
| `GET` | `/api/delivery/:contentType/:slug` | Get entry by slug |

### Business API (public)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pages/types` | List content types |
| `GET` | `/pages/:contentType` | List published entries |
| `GET` | `/pages/:contentType/:slug` | Get entry by slug |

### Infrastructure

| Path | Description |
|------|-------------|
| `/health` | Health check |
| `/api` | Swagger UI |

## Project structure

```
src/
  main.ts              # createApp() — single config object
  app.module.ts         # Only business modules (no infra wiring)
  pages/               # Business module: renders content
  notifications/       # Business module: content event hooks
  seed.ts              # Seed script for sample data
```

## Key concept

`AppModule` contains **only business logic**. All infrastructure (database, cache, auth, content service, health, logging) is auto-wired by `createApp()` based on the config object in `main.ts`. Omit a config section and that module is simply not loaded.
