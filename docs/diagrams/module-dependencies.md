# Module Dependencies

> How nestjs-boot modules wire together. All modules are optional — omit config = not loaded.

## Core Module Map

```mermaid
flowchart TB
    subgraph Config ["Configuration Layer"]
        CONF["BootConfigModule<br/>.env + validation"]
    end

    subgraph Data ["Data Layer"]
        DB["DatabaseModule<br/>MongoDB / Mongoose"]
        PRISMA["PrismaModule<br/>PostgreSQL / Prisma"]
        CACHE["CacheModule<br/>Memory + Redis"]
        QUEUE["QueueModule<br/>BullMQ"]
        EVENTS["EventBusModule<br/>Memory / Redis"]
        CQRS["CqrsModule<br/>Commands + Events"]
    end

    subgraph Auth ["Auth & Security Layer"]
        AUTH["AuthModule<br/>JWT + API Key + RBAC"]
        SCOPE["ScopeModule<br/>OWN→SYSTEM"]
        POLICY["PolicyModule<br/>Named policies"]
        ORG["OrganizationModule<br/>Org/Dept/Team"]
        AUDIT["AuditModule<br/>Audit + Security events"]
        ISA["InterServiceAuthModule<br/>Cross-service propagation"]
        TENANT["TenancyModule<br/>Multi-tenant isolation"]
    end

    subgraph Transport ["Communication Layer"]
        TRANS["TransportModule<br/>gRPC / TCP / NATS / RMQ"]
        RPC["RpcModule<br/>gRPC errors"]
        WS["WebSocketModule<br/>Socket.IO / ws"]
        CORR["CorrelationModule<br/>X-Correlation-Id"]
    end

    subgraph Observe ["Observability Layer"]
        LOG["LoggingModule<br/>Pino structured"]
        METRICS["MetricsModule<br/>Prometheus"]
        TRACE["TracingModule<br/>OpenTelemetry"]
        ALERT["AlertModule<br/>Multi-channel"]
    end

    subgraph API ["API Layer"]
        SWAGGER["SwaggerModule<br/>OpenAPI"]
        VER["VersioningModule<br/>URI / Header"]
        PAY["WebhookModule<br/>Stripe / PayPal"]
        STORE["StorageModule<br/>Local / S3 / GCS"]
    end

    subgraph Infra ["Infrastructure Layer"]
        HEALTH["HealthModule<br/>Terminus"]
        SHUT["ShutdownModule<br/>Graceful drain"]
        DEPLOY["DeployHooksModule<br/>Lifecycle hooks"]
        RESIL["Resilience<br/>Circuit breaker"]
    end

    CONF --> AUTH
    CONF --> DB
    CONF --> PRISMA
    CONF --> CACHE

    DB --> HEALTH
    CACHE --> HEALTH
    DB --> CQRS

    AUTH --> SCOPE
    AUTH --> POLICY
    AUTH --> AUDIT
    ORG --> SCOPE
    SCOPE --> POLICY

    TRANS --> CORR
    TRANS --> RPC
    TRANS --> ISA
    AUTH --> ISA

    LOG --> METRICS
    TRACE --> METRICS

    style Config fill:#f59e0b,color:#000
    style Data fill:#10b981,color:#fff
    style Auth fill:#8b5cf6,color:#fff
    style Transport fill:#0ea5e9,color:#fff
    style Observe fill:#ec4899,color:#fff
    style API fill:#6366f1,color:#fff
    style Infra fill:#64748b,color:#fff
```

## Database Driver Selection

```mermaid
flowchart LR
    APP["Your App"] --> CHOICE{"Database?"}

    CHOICE -->|MongoDB| MONGO["DatabaseModule.register()<br/>+ BaseRepository"]
    CHOICE -->|PostgreSQL| PG["PrismaModule.register()<br/>+ PrismaBaseRepository"]
    CHOICE -->|Both| BOTH["DatabaseModule + PrismaModule<br/>side by side"]

    MONGO --> FEAT_M["MongooseModule.forFeature()<br/>Schema + Model"]
    PG --> FEAT_P["prisma/schema.prisma<br/>npx prisma migrate"]
    BOTH --> FEAT_M
    BOTH --> FEAT_P

    style MONGO fill:#10b981,color:#fff
    style PG fill:#3b82f6,color:#fff
    style BOTH fill:#8b5cf6,color:#fff
```

## Auth Stack Composition

```mermaid
flowchart TD
    subgraph Required ["Always Required"]
        JWT["AuthModule<br/>JWT + Guards"]
    end

    subgraph Optional ["Opt-in Modules"]
        RBAC["RBAC<br/>rbac.enabled: true"]
        HIER["Role Hierarchy<br/>rbac.hierarchy: [...]"]
        SA["Super Admin<br/>rbac.superAdmin: 'X'"]
        DBD["Deny by Default<br/>rbac.denyByDefault: true"]
        PS["Permission Store<br/>rbac.permissionStore: impl"]
        LT["Login Tracker<br/>loginTracker: { ... }"]
        TS["Token Store<br/>jwt.tokenStore: impl"]
    end

    subgraph Separate ["Separate Modules"]
        SC["ScopeModule.register()"]
        PO["PolicyModule.register()"]
        OR["OrganizationModule.register()"]
        AU["AuditModule.register()"]
    end

    JWT --> RBAC
    RBAC --> HIER
    RBAC --> SA
    RBAC --> DBD
    RBAC --> PS
    JWT --> LT
    JWT --> TS

    SC -.->|"scope context from"| OR
    PO -.->|"org context from"| OR
    AU -.->|"logs decisions from"| JWT

    style Required fill:#dc2626,color:#fff
    style Optional fill:#f59e0b,color:#000
    style Separate fill:#3b82f6,color:#fff
```

## `createApp()` Boot Sequence

```mermaid
sequenceDiagram
    participant U as User Code
    participant CA as createApp()
    participant V as Validator
    participant B as BootModule
    participant N as NestFactory
    participant A as App

    U->>CA: createApp(AppModule, options)
    CA->>V: validateBootOptions(options)
    V-->>CA: validated config

    opt tracing configured
        CA->>CA: initTracing() — before NestFactory
    end

    CA->>B: Build dynamic BootModule
    Note over B: Only imports modules for<br/>configured options sections

    B->>B: + DatabaseModule (if database)
    B->>B: + PrismaModule (if prisma)
    B->>B: + CacheModule (if cache)
    B->>B: + AuthModule (if auth)
    B->>B: + TransportModule (if transport)
    B->>B: + EventBusModule (if events)
    B->>B: + QueueModule (if queue)
    B->>B: + MetricsModule (if metrics)
    B->>B: + LoggingModule (if logging)
    B->>B: + HealthModule (if health)
    B->>B: + ShutdownModule (always)

    CA->>N: NestFactory.create(BootModule)
    N-->>CA: app instance
    CA->>A: Apply global pipes/filters/interceptors
    CA->>A: connectTransports (if configured)
    CA-->>U: ready app
```
