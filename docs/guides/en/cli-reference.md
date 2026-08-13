# CLI Reference — nestjs-boot

> Scaffold production-ready NestJS microservices with one command.

---

## Quick Start

```bash
npx nestjs-boot new my-service
```

This launches an interactive wizard that walks through database, cache, auth, and transport options, then generates a complete project with Docker, K8s manifests, tests, and CI configuration.

---

## Command

```
nestjs-boot new <project-name> [options]
```

The `new` keyword is optional — `npx nestjs-boot my-service` also works.

---

## Flags

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--db=<type>` | `mongodb`, `none` | `mongodb` | Database provider |
| `--cache=<type>` | `redis`, `memcached`, `none` | `redis` | Cache provider |
| `--auth=<type>` | `jwt`, `none` | `jwt` | Authentication strategy |
| `--transport=<type>` | `http`, `grpc`, `tcp`, `nats`, `rabbitmq` | `http` | Transport layer (always includes HTTP) |
| `--ci=<provider>` | `github`, `gitlab` | none | Generate CI/CD pipeline config |
| `--observability` | flag | off | Include Prometheus, Grafana dashboards, Jaeger, Loki docker-compose |
| `-y`, `--yes` | flag | off | Accept all defaults, skip prompts |
| `-h`, `--help` | flag | — | Show help |

### Examples

```bash
# Full stack with gRPC + GitHub Actions
npx nestjs-boot new order-service --db=mongodb --cache=redis --auth=jwt --transport=grpc --ci=github

# Minimal HTTP service, no prompts
npx nestjs-boot new my-api --db=none --cache=none --auth=none -y

# With observability stack
npx nestjs-boot new analytics-service --observability

# All defaults, no prompts
npx nestjs-boot new my-service -y
```

---

## Interactive Prompts

When flags are not provided, the CLI prompts for each option:

1. **Project name** — lowercase alphanumeric with hyphens (e.g., `order-service`)
2. **Database** — MongoDB (Mongoose) or None
3. **Cache** — Redis, Memcached, or None
4. **Auth** — JWT or None
5. **Transport** — HTTP only, HTTP + gRPC, HTTP + TCP, HTTP + NATS, HTTP + RabbitMQ

Prompts are powered by `@clack/prompts` with colored output via `picocolors`.

---

## Generated File Structure

```
my-service/
  src/
    main.ts                    # createApp() with selected options
    app.module.ts              # Root module
    app.controller.ts          # Hello endpoint
    app.service.ts             # Hello service
  test/
    app.e2e-spec.ts            # E2E test (vitest + supertest)
  k8s/
    deployment.yaml            # Kubernetes Deployment
    service.yaml               # Kubernetes Service
    configmap.yaml             # Environment ConfigMap
    hpa.yaml                   # Horizontal Pod Autoscaler
    ingress.yaml               # Ingress resource
  proto/                       # Only with --transport=grpc
    my-service.proto           # gRPC service definition
  observability/               # Only with --observability
    prometheus.yml
    grafana/
      dashboards/
        http-overview.json
        service-health.json
        microservice-overview.json
      alerts.yml
  .github/workflows/ci.yml    # Only with --ci=github
  .gitlab-ci.yml               # Only with --ci=gitlab
  Dockerfile                   # Multi-stage (builder + production)
  docker-compose.yml           # App + infrastructure services
  docker-compose.override.yml  # Dev overrides (hot reload, debug port)
  docker-compose.observability.yml  # Only with --observability
  package.json
  tsconfig.json
  vitest.config.ts
  .env / .env.example
  .gitignore
  .dockerignore
  .eslintrc.cjs
  .prettierrc
  README.md
```

---

## CI/CD Templates

### GitHub Actions (`--ci=github`)

Generated at `.github/workflows/ci.yml`:

- **Matrix:** Node 18.x + 20.x, 2 test shards
- **Steps:** checkout, npm ci, lint, test (sharded via `vitest --shard`), build
- **Coverage job:** runs after tests, uploads artifact

### GitLab CI (`--ci=gitlab`)

Generated at `.gitlab-ci.yml`:

- **Stages:** lint, test, build, coverage
- **Cache:** `node_modules/` keyed by branch
- **Parallel tests:** 2 shards

---

## Kubernetes Templates

All K8s manifests are generated in `k8s/` with sensible defaults:

| File | Description |
|------|-------------|
| `deployment.yaml` | 2 replicas, resource limits, liveness/readiness probes on `/health` |
| `service.yaml` | ClusterIP on port 3000 |
| `configmap.yaml` | Environment variables (NODE_ENV, log level) |
| `hpa.yaml` | Auto-scale 2-10 replicas at 80% CPU |
| `ingress.yaml` | Ingress resource with TLS placeholder |

---

## Observability Templates (`--observability`)

| File | Description |
|------|-------------|
| `prometheus.yml` | Scrape config targeting the app's `/metrics` endpoint |
| `docker-compose.observability.yml` | Prometheus + Grafana + Jaeger + Loki stack |
| `grafana/dashboards/http-overview.json` | HTTP request rate, latency, error rate panels |
| `grafana/dashboards/service-health.json` | CPU, memory, event loop lag, GC panels |
| `grafana/dashboards/microservice-overview.json` | Cross-service call graph, inter-service latency |
| `grafana/alerts.yml` | Alert rules for error rate, latency P99, pod restarts |

---

## Template Customization

Templates use a Handlebars-like syntax with these directives:

| Syntax | Description |
|--------|-------------|
| `{{name}}` | Project name substitution |
| `{{#if flag}}...{{/if}}` | Conditional block (boolean flag) |
| `{{#eq field "value"}}...{{/eq}}` | Equality check |
| `{{#neq field "value"}}...{{/neq}}` | Inequality check |
| `{{#in field "v1\|v2"}}...{{/in}}` | Inclusion check |

Templates live in the `templates/` directory of the nestjs-boot package. To customize, fork the repo and edit the `.tpl` files directly.

---

## Resource Generator

Generate CRUD resources inside an existing project:

```bash
npx nestjs-boot generate <resource-name>
npx nestjs-boot generate product
```

Creates `src/<name>/` with schema, DTO, service, controller, module, and test files. Use `--minimal` for just module + service (no controller).
