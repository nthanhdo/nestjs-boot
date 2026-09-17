# Content Service

A Headless CMS module for nestjs-boot -- simpler than Strapi, configured entirely via `.env`, deployable standalone in under 5 minutes.

## Features

- Dynamic content types with 16 field types, defined via API (no code changes required)
- Reusable components (SEO blocks, CTAs, etc.) shared across content types
- Publishing workflow: Draft, Approved, Scheduled, Published, Rejected, Unpublished, Archived
- Localization with field-level control (EN + VI out of the box, extensible)
- Entry versioning with rollback to any previous version
- PostgreSQL full-text search with `tsvector`, `pg_trgm`, and `unaccent` for Vietnamese diacritics
- Media/asset management via S3 or Cloudflare R2
- REST Management API (JWT + RBAC) and Delivery API (API key auth)
- Optional GraphQL endpoint for the Delivery API
- Webhooks with HMAC-SHA256 signatures and exponential backoff retry
- Row-level multi-tenancy
- Two-layer caching (Redis + Memcached, independently toggleable)
- Soft delete and audit trail integration
- Mock UI (static HTML) for demo purposes
- Seed data with sample Blog Post, Product, and FAQ content types

## Quick Start

**Prerequisites:** Docker and Docker Compose (or Node.js 18+ with PostgreSQL and Redis installed manually).

```bash
# 1. Clone the repository
git clone https://github.com/nthanhdo/nestjs-boot.git
cd nestjs-boot

# 2. Create your environment file
cp .env.content-service.example .env
# Edit .env — fill in STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, DELIVERY_API_KEY

# 3. Start all services (PostgreSQL + Redis + content-service)
docker compose -f docker/content-service/docker-compose.yml up -d

# 4. Seed sample data (optional)
npx nestjs-boot seed --service content

# 5. Open the Mock UI
open http://localhost:3000/content-ui
```

The Management API is available at `http://localhost:3000/api/content/*` and the Delivery API at `http://localhost:3000/api/delivery/*`.

## Configuration

All configuration is done through environment variables. Copy `.env.content-service.example` as a starting point.

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOOT_SERVICES_CONTENT` | Yes | -- | Set to `true` to enable the content service module |
| `DATABASE_URL` | Yes | -- | PostgreSQL connection string |
| `CACHE_REDIS_ENABLED` | No | `false` | Enable Redis cache layer |
| `CACHE_REDIS_URL` | No | -- | Redis connection URL (required if Redis enabled) |
| `CACHE_MEMCACHED_ENABLED` | No | `false` | Enable Memcached cache layer |
| `CACHE_MEMCACHED_HOSTS` | No | -- | Memcached host(s) (required if Memcached enabled) |
| `STORAGE_PROVIDER` | No | `s3` | Storage backend: `s3` or `r2` |
| `STORAGE_BUCKET` | No | -- | S3/R2 bucket name |
| `STORAGE_REGION` | No | -- | AWS region (for S3) |
| `STORAGE_ACCESS_KEY` | No | -- | Storage access key |
| `STORAGE_SECRET_KEY` | No | -- | Storage secret key |
| `STORAGE_R2_ACCOUNT_ID` | No | -- | Cloudflare account ID (for R2) |
| `CONTENT_DEFAULT_LOCALE` | No | `en` | Default locale code |
| `CONTENT_LOCALES` | No | `en` | Comma-separated supported locales |
| `CONTENT_CACHE_TTL` | No | `300` | Delivery API cache TTL in seconds |
| `CONTENT_GRAPHQL` | No | `false` | Enable GraphQL delivery endpoint |
| `CONTENT_ENABLE_SEARCH` | No | `true` | Enable PostgreSQL full-text search |
| `CONTENT_ENABLE_WEBHOOKS` | No | `true` | Enable webhook dispatching |
| `DELIVERY_API_KEY` | Yes | -- | API key required for Delivery API access |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | Node environment |

## Architecture

```
                          +------------------+
                          |  ContentModule   |
                          +--------+---------+
                                   |
         +----------+---------+----+----+---------+----------+
         |          |         |         |         |          |
   ContentType  ContentEntry  Asset  Localization  Webhook  Search
    Service      Service    Service   Service     Service   Service
         |          |         |         |         |          |
         +----------+---------+---------+---------+----------+
                          |         |         |
                       Prisma   StorageModule  CacheModule
                     (PostgreSQL)  (S3/R2)   (Redis/Memcached)
```

The `ContentModule` is self-contained. It depends on:

- **Prisma** (PostgreSQL) -- content types, entries, versions, assets, locales, webhooks, and API keys are stored across 9 Prisma models
- **StorageModule** -- delegates file uploads to S3 or Cloudflare R2
- **CacheModule** -- optional L1 (Memcached) + L2 (Redis) caching for Delivery API responses with tag-based invalidation on publish
- **AuditModule** -- audit trail for all entry and workflow transitions
- **TenancyModule** -- row-level multi-tenancy via `tenant_id` column
- **AuthModule** -- JWT authentication for the Management API
- **RBAC module** -- role-based access control (Admin, Content Manager, Content Editor, Developer, Consumer)

Services are toggled via `BOOT_SERVICES_*` environment variables. Unneeded modules are never loaded.

## Content Types

Content types are created and managed entirely through the Management API. No code changes are needed.

### Supported Field Types

| Field Type | API Value | Description | Notes |
|---|---|---|---|
| Short Text | `text` | String up to 255 characters | Titles, tags, names |
| Long Text | `textarea` | Unlimited plain text | |
| Rich Text | `richtext` | Structured JSON content (ProseMirror/TipTap) | Rendered as HTML on delivery |
| Number | `number` | Integer or float | Distinguishes integer/decimal |
| Boolean | `boolean` | True/false | |
| Date | `date` | Date only | UTC storage |
| DateTime | `datetime` | Date and time | UTC storage |
| Media | `media` | Reference to an uploaded asset | |
| Reference | `reference` | Link to another entry | One-to-one or one-to-many |
| JSON | `json` | Raw JSON object | Optional schema validation |
| Enum | `enum` | Selection from a defined list | Single or multi-select |
| Slug | `slug` | Auto-generated from a source field | Configurable source |
| URL | `url` | Validated URL string | |
| Email | `email` | Validated email address | |
| Color | `color` | Hex color value | Phase 2 |
| Component | `component` | Embeds a reusable component | References component by slug |

### Field Definition Structure

```typescript
import type { ContentFieldDefinition } from 'nestjs-boot/content';

const field: ContentFieldDefinition = {
  name: 'title',            // snake_case identifier
  label: 'Title',           // Display label
  type: 'text',             // One of the field types above
  localized: true,          // Whether this field varies per locale
  validation: {
    required: true,
    maxLength: 255,
  },
  helpText: 'The main title of the article',
  defaultValue: undefined,
  order: 1,
};
```

### Validation Rules

| Rule | Applies To | Description |
|---|---|---|
| `required` | All | Field must have a value |
| `unique` | All | Value must be unique (scoped per locale) |
| `minLength` / `maxLength` | Text fields | Character length bounds |
| `min` / `max` | Number fields | Numeric value bounds |
| `pattern` | Text fields | Custom regex validation |
| `allowedValues` | Enum fields | Restricts to defined options |

### Reusable Components

Components are groups of fields that can be shared across content types. For example, an SEO component:

```typescript
// Created via POST /api/components
{
  "name": "SEO",
  "slug": "seo",
  "fields": [
    { "name": "meta_title", "label": "Meta Title", "type": "text", "validation": { "maxLength": 60 } },
    { "name": "meta_description", "label": "Meta Description", "type": "textarea", "validation": { "maxLength": 160 } },
    { "name": "og_image", "label": "OG Image", "type": "url" }
  ]
}
```

Embed a component in a content type by adding a field with `type: 'component'` and `componentSlug: 'seo'`.

## Publishing Workflow

Every content entry follows a state machine with the following transitions:

```
Draft -----> Approved -----> Scheduled -----> Published
  ^             |                                 |
  |             v                                 v
  +-------- Rejected                        Unpublished ----> Archived
  ^                                              |
  |                                              |
  +----------------------------------------------+
  ^                                              
  +--- Archived (can return to Draft)            
```

| State | Description | Visible on Delivery API |
|---|---|---|
| `DRAFT` | Work in progress, editable | No |
| `APPROVED` | Reviewed and approved, ready for publish or scheduling | No |
| `SCHEDULED` | Queued for automatic publish at a specific datetime (via BullMQ cron) | No |
| `PUBLISHED` | Live and served to consumers | Yes |
| `REJECTED` | Returned with a required comment; transitions back to Draft | No |
| `UNPUBLISHED` | Removed from Delivery API but data is preserved | No |
| `ARCHIVED` | Long-term storage, no longer active | No |

### Allowed Transitions

| From | Allowed Next States |
|---|---|
| `DRAFT` | `APPROVED`, `ARCHIVED` |
| `APPROVED` | `PUBLISHED`, `SCHEDULED`, `REJECTED` |
| `SCHEDULED` | `PUBLISHED`, `APPROVED`, `REJECTED` |
| `PUBLISHED` | `UNPUBLISHED`, `ARCHIVED` |
| `REJECTED` | `DRAFT` |
| `UNPUBLISHED` | `DRAFT`, `ARCHIVED` |
| `ARCHIVED` | `DRAFT` |

Approval is configurable per content type. Scheduled publish/unpublish is handled by a background cron job (check interval defaults to 60 seconds).

## Localization

The content service supports field-level localization with a fallback chain.

- **Default locale:** `en` (configurable via `CONTENT_DEFAULT_LOCALE`)
- **Supported locales:** `en,vi` (configurable via `CONTENT_LOCALES`, extensible via API)
- **Field-level control:** Each field definition has a `localized` boolean. Non-localized fields (e.g., `slug`, `sku`) share the same value across all locales.
- **Fallback chain:** `vi` falls back to `en`. If a field is not translated in the requested locale, the default locale value is returned.
- **Independent publishing:** Each locale can be published independently (publish Vietnamese without publishing English).
- **Translation status:** Tracked per field per locale.

Request a specific locale on the Delivery API with `?locale=vi`.

## API Reference

### Management API

Authenticated via JWT + RBAC. Base path: `/api/content`.

#### Content Types

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/content-types` | Create a content type |
| `GET` | `/api/content-types` | List all content types |
| `GET` | `/api/content-types/:id` | Get content type with fields |
| `PUT` | `/api/content-types/:id` | Update a content type |
| `DELETE` | `/api/content-types/:id` | Soft delete a content type |
| `POST` | `/api/content-types/:id/fields` | Add a field |
| `PUT` | `/api/content-types/:id/fields/:fieldId` | Update a field |
| `DELETE` | `/api/content-types/:id/fields/:fieldId` | Remove a field |

#### Components

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/components` | Create a reusable component |
| `GET` | `/api/components` | List all components |
| `PUT` | `/api/components/:id` | Update a component |
| `DELETE` | `/api/components/:id` | Delete a component |

#### Entries

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/content/entries` | Create entry (auto-saves as Draft) |
| `GET` | `/api/content/entries` | List entries (filterable) |
| `GET` | `/api/content/entries/:id` | Get entry by ID |
| `PUT` | `/api/content/entries/:id` | Update entry (creates new version) |
| `DELETE` | `/api/content/entries/:id` | Soft delete entry |
| `POST` | `/api/content/entries/:id/approve` | Approve entry |
| `POST` | `/api/content/entries/:id/reject` | Reject with comment |
| `POST` | `/api/content/entries/:id/publish` | Publish immediately |
| `POST` | `/api/content/entries/:id/schedule` | Schedule publish (`{ scheduledAt }`) |
| `POST` | `/api/content/entries/:id/unpublish` | Unpublish |
| `POST` | `/api/content/entries/:id/archive` | Archive |
| `GET` | `/api/content/entries/:id/versions` | List entry versions |
| `GET` | `/api/content/entries/:id/versions/:v` | Get specific version |
| `POST` | `/api/content/entries/:id/versions/:v/restore` | Rollback to version |
| `POST` | `/api/content/entries/:id/duplicate` | Duplicate entry |

#### Assets

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/assets` | Upload asset (multipart) |
| `GET` | `/api/assets` | List assets (filter by type, folder, tag) |
| `GET` | `/api/assets/:id` | Get asset detail |
| `PUT` | `/api/assets/:id` | Update metadata |
| `DELETE` | `/api/assets/:id` | Delete asset |

#### Locales

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/locales` | List configured locales |
| `POST` | `/api/locales` | Add a locale |
| `DELETE` | `/api/locales/:code` | Remove a locale |

#### Webhooks

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/webhooks` | List webhooks |
| `POST` | `/api/webhooks` | Create a webhook |
| `PUT` | `/api/webhooks/:id` | Update a webhook |
| `DELETE` | `/api/webhooks/:id` | Delete a webhook |
| `GET` | `/api/webhooks/:id/logs` | View delivery logs |

### Delivery API

Read-only. Requires `DELIVERY_API_KEY` in the `x-api-key` header. Base path: `/api/delivery`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/delivery/types` | List content type schemas |
| `GET` | `/api/delivery/entries` | List published entries |
| `GET` | `/api/delivery/entries/:id` | Get published entry by ID |
| `GET` | `/api/delivery/entries/by-slug/:slug` | Get published entry by slug |
| `GET` | `/api/delivery/assets/:id` | Get asset URL and metadata |

#### Query Parameters

| Parameter | Example | Description |
|---|---|---|
| `type` | `?type=blog-post` | Filter by content type slug |
| `locale` | `?locale=vi` | Locale (falls back to default) |
| `search` | `?search=nestjs` | Full-text search query |
| `sort` | `?sort=publishedAt:desc` | Sort by field and direction |
| `page` | `?page=2` | Page number (offset pagination) |
| `pageSize` | `?pageSize=10` | Items per page (default: 25) |
| `fields` | `?fields=title,slug` | Select specific fields |
| `preview` | `?preview=true` | Show draft entries (requires preview API key) |
| `populate` | `?populate=author,category` | Resolve references (max depth: 3) |
| `filters` | `?filters[category][eq]=technology` | Field-level filtering |

## GraphQL

The GraphQL endpoint is disabled by default. To enable it:

1. Install peer dependencies:

```bash
npm install @nestjs/graphql @nestjs/apollo @apollo/server graphql
```

2. Set the environment variable:

```
CONTENT_GRAPHQL=true
```

3. The endpoint becomes available at `POST /graphql`.

### Sample Queries

```graphql
# List content types
query {
  contentTypes {
    id
    name
    slug
    fields { name type localized }
  }
}

# Get entries by type and locale
query {
  entries(type: "blog-post", locale: "en") {
    id
    slug
    data
    status
    publishedAt
  }
}

# Get a single entry by slug
query {
  entry(slug: "getting-started-nestjs-boot") {
    id
    data
    locale
    status
  }
}

# Get an asset with signed URL
query {
  asset(id: "asset-uuid") {
    id
    url
    metadata { title alt }
  }
}
```

## Search

Full-text search is powered entirely by PostgreSQL -- no external search engine required.

| Capability | Implementation | Description |
|---|---|---|
| Full-text search | `tsvector` + `tsquery` with GIN index | Standard PostgreSQL text search |
| Weighted ranking | Weight A (title), Weight B (body) | Titles rank higher than body content |
| Fuzzy/typo-tolerant | `pg_trgm` (trigram similarity) | Matches despite minor typos |
| Vietnamese diacritics | `unaccent` extension | Searches match with or without diacritical marks |
| Field filtering | JSONB operators | Filter by any field value in the entry data |
| Status/type/locale/date/author filtering | SQL WHERE clauses | Combinable with text search |

Search is available on both the Management API (`GET /api/content/entries?search=...`) and the Delivery API (`GET /api/delivery/entries?search=...`). On the Delivery API, search results are restricted to published entries.

## Webhooks

Webhooks fire on content lifecycle events and are configured via the Management API.

### Events

| Event | Trigger |
|---|---|
| `entry.created` | New entry created |
| `entry.updated` | Entry data modified |
| `entry.published` | Entry published (triggers SSG rebuild, cache purge) |
| `entry.unpublished` | Entry unpublished |
| `entry.deleted` | Entry soft-deleted |
| `entry.status_changed` | Any workflow state transition |
| `content-type.created` | New content type created |
| `content-type.updated` | Content type schema modified |
| `asset.uploaded` | New asset uploaded |
| `asset.deleted` | Asset deleted |

### Security

Every webhook request includes an `x-signature` header containing an HMAC-SHA256 signature of the request body, computed with the webhook's secret key. Verify this signature on the receiving end to ensure authenticity.

### Retry Strategy

Failed deliveries (non-2xx response or timeout) are retried up to 3 times with exponential backoff:

| Attempt | Delay |
|---|---|
| 1st retry | 1 second |
| 2nd retry | 10 seconds |
| 3rd retry | 60 seconds |

Delivery logs are retained for 30 days and viewable via `GET /api/webhooks/:id/logs`.

## Mock UI

A static HTML demo UI is served at `/content-ui` when the content service is running. It covers:

- Content type builder (create types, add fields)
- Entry CRUD (create, edit, list entries)
- Publishing workflow controls (approve, reject, publish, schedule)
- Asset browser and upload
- Locale management
- Webhook configuration
- API key management

> **Note:** The Mock UI is for demonstration only. A full admin panel (Next.js + React) is planned as a separate repository in Phase 2.

<!-- Screenshot placeholder: add a screenshot of the Mock UI here when available -->

## Seed Data

The `seedContentData` function populates the database with sample content for development and demos.

```typescript
import { seedContentData } from 'nestjs-boot/content';

// After Prisma connects:
await seedContentData(prismaClient);

// With multi-tenancy:
await seedContentData(prismaClient, 'tenant-id');
```

Or via CLI:

```bash
npx nestjs-boot seed --service content
```

This creates:

- **Locales:** English (default) + Vietnamese
- **Components:** SEO (meta_title, meta_description, og_image)
- **Content types:** Blog Post (10 fields), Product (9 fields), FAQ (4 fields)
- **Entries:** 8 sample entries across all types, with EN and VI translations, in both PUBLISHED and DRAFT states

## Standalone Deployment

The content service can be deployed standalone using Docker Compose. The configuration at `docker/content-service/docker-compose.yml` includes PostgreSQL 16, Redis 7, and the content service itself.

```bash
# Start everything
docker compose -f docker/content-service/docker-compose.yml up -d

# View logs
docker compose -f docker/content-service/docker-compose.yml logs -f content-service

# Stop
docker compose -f docker/content-service/docker-compose.yml down
```

The docker-compose file uses health checks to ensure PostgreSQL and Redis are ready before the content service starts. Data is persisted in a named volume (`postgres_data`).

For custom configuration, override environment variables in the `docker-compose.yml` or mount a `.env` file.

### Production Recommendations

- Use PgBouncer for PostgreSQL connection pooling
- Enable both Redis and Memcached cache layers for high-traffic Delivery API
- Place behind a reverse proxy (nginx) with TLS termination
- Set `NODE_ENV=production`

## Content Service vs Strapi

| Aspect | Content Service | Strapi |
|---|---|---|
| **Configuration** | Single `.env` file | Admin panel + `config/` directory |
| **Plugin system** | None -- built-in features only | Extensive plugin marketplace |
| **Deployment** | Runs inside nestjs-boot (or standalone) | Separate process |
| **Database** | PostgreSQL only (optimized for full-text search + future RAG) | PostgreSQL, MySQL, SQLite |
| **Search** | Built-in PostgreSQL full-text (tsvector, trigram, unaccent) | Requires external plugin or engine |
| **GraphQL** | Optional, auto-generated from content types | Plugin-based |
| **Multi-tenancy** | Built-in row-level isolation | Not built-in |
| **Caching** | Two-layer (Redis + Memcached) with tag-based invalidation | Manual or plugin |
| **Localization** | Field-level with fallback chain | Built-in (similar) |
| **UI** | Mock HTML demo (full UI in Phase 2) | Full admin panel included |
| **Webhooks** | Built-in with HMAC signature + retry | Built-in |
| **Learning curve** | Minimal -- `.env` + API calls | Moderate -- config files, plugins, admin panel |
| **Best for** | Teams already on NestJS who need embedded CMS | Standalone CMS projects needing rich plugin ecosystem |
