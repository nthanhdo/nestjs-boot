# Authentication & Authorization Flow

> How every protected request is evaluated in nestjs-boot.

## Request Pipeline

```mermaid
flowchart TD
    REQ([HTTP Request]) --> PUB{{"@Public()?"}}
    PUB -->|Yes| ALLOW[/"Allow — skip all guards"/]
    PUB -->|No| JWT["JwtAuthGuard<br/>verify Bearer token"]

    JWT -->|Invalid/Missing| R401["401 Unauthorized"]
    JWT -->|Valid| REV{"isRevoked()?"}
    REV -->|Revoked| R401
    REV -->|OK| APIKEY{"API Key<br/>configured?"}

    APIKEY -->|Yes| AKG["ApiKeyGuard<br/>validate(key)"]
    APIKEY -->|No| ROLES
    AKG -->|Invalid| R401
    AKG -->|Valid| ROLES

    ROLES{"@Roles()?"} -->|No decorator| DBD{"denyByDefault?"}
    DBD -->|true| R403["403 Forbidden"]
    DBD -->|false| PERMS

    ROLES -->|Has decorator| SA1{"superAdmin?"}
    SA1 -->|Yes| PERMS
    SA1 -->|No| HIER["Resolve role<br/>hierarchy"]
    HIER --> RMATCH{"User has ANY<br/>required role?"}
    RMATCH -->|No| R403
    RMATCH -->|Yes| PERMS

    PERMS{"@Permissions()?"} -->|No decorator| DBD2{"denyByDefault?"}
    DBD2 -->|true| R403
    DBD2 -->|false| SCOPE

    PERMS -->|Has decorator| SA2{"superAdmin?"}
    SA2 -->|Yes| SCOPE
    SA2 -->|No| PLOAD["Load permissions<br/>JWT + hierarchy + store"]
    PLOAD --> PMATCH{"User has ALL<br/>required perms?"}
    PMATCH -->|No| R403
    PMATCH -->|Yes| SCOPE

    SCOPE{"@RequireScope()?"} -->|No| POLICY
    SCOPE -->|Has decorator| SRES["ScopeResolver<br/>resolve user scope"]
    SRES --> SMATCH{"User scope ≥<br/>required scope?"}
    SMATCH -->|No| R403
    SMATCH -->|Yes| POLICY

    POLICY{"@CheckPolicy()?"} -->|No| CTRL
    POLICY -->|Has decorator| PENG["PolicyEngine<br/>evaluate(context)"]
    PENG --> PRESULT{"allowed?"}
    PRESULT -->|No| R403
    PRESULT -->|Yes| CTRL

    CTRL[/"Controller handler"/] --> AUDIT["AuditInterceptor<br/>log result"]

    R401 --> AUDIT2["AuditInterceptor<br/>log denial"]
    R403 --> AUDIT2

    style ALLOW fill:#10b981,color:#fff
    style R401 fill:#ef4444,color:#fff
    style R403 fill:#ef4444,color:#fff
    style CTRL fill:#3b82f6,color:#fff
    style AUDIT fill:#8b5cf6,color:#fff
    style AUDIT2 fill:#8b5cf6,color:#fff
```

## Guard Execution Order

```mermaid
sequenceDiagram
    participant C as Client
    participant J as JwtAuthGuard
    participant A as ApiKeyGuard
    participant R as RolesGuard
    participant P as PermissionsGuard
    participant S as ScopeGuard
    participant PL as PolicyGuard
    participant H as Handler
    participant AU as AuditInterceptor

    C->>J: Bearer token
    J->>J: verify JWT + check isRevoked
    J->>A: request.user = decoded
    A->>A: validate API key (if configured)
    A->>R: pass
    R->>R: extract roles → resolve hierarchy → check superAdmin → match ANY
    R->>P: pass
    P->>P: load perms (JWT + hierarchy + store) → match ALL
    P->>S: pass
    S->>S: resolve scope → compare levels
    S->>PL: pass
    PL->>PL: build context → evaluate policy
    PL->>H: ALLOW
    H->>AU: response
    AU->>C: 200 OK

    Note over J,PL: Any guard can short-circuit with 401/403
    Note over AU: Catches ForbiddenException/UnauthorizedException → audit log
```

## Permission Resolution

```mermaid
flowchart LR
    subgraph Sources["Permission Sources"]
        JWT["JWT payload<br/>req.user.permissions"]
        HIER["Role Hierarchy<br/>getAllPermissions(roles)"]
        STORE["PermissionStore<br/>getUserPermissions(id)"]
        SROLE["Store Roles<br/>getUserRoles → hierarchy"]
    end

    JWT --> MERGE["Merge all<br/>(Set union)"]
    HIER --> MERGE
    STORE --> MERGE
    SROLE --> MERGE

    MERGE --> CHECK{"requiredPerms.every()<br/>∈ merged set?"}
    CHECK -->|Yes| OK["ALLOW"]
    CHECK -->|No| DENY["403 Forbidden"]

    style OK fill:#10b981,color:#fff
    style DENY fill:#ef4444,color:#fff
```

## Token Refresh Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as AuthService
    participant TS as TokenStore
    participant JWT as BootJwtService

    C->>S: POST /auth/refresh {refreshToken}
    S->>TS: getToken(tokenId)
    TS-->>S: {familyId, userId, used: false}

    alt Token already used (REUSE DETECTED)
        TS-->>S: {used: true}
        S->>TS: revokeFamily(familyId)
        S->>S: logSecurityEvent(REFRESH_TOKEN_REUSE)
        S-->>C: 401 Unauthorized
    end

    S->>TS: markUsed(tokenId)
    S->>JWT: rotateRefreshToken(oldToken)
    JWT-->>S: {accessToken, refreshToken}
    S->>TS: storeToken(newTokenId, familyId, userId, expiresAt)
    S-->>C: {accessToken, refreshToken}
```

## Login Attempt Tracking

```mermaid
stateDiagram-v2
    [*] --> Normal: First request
    Normal --> Normal: Success → reset counter
    Normal --> Counting: Failed attempt
    Counting --> Counting: count < maxAttempts
    Counting --> Locked: count >= maxAttempts
    Counting --> Normal: Successful login
    Locked --> Normal: lockoutDuration expired
    Locked --> Normal: Manual unlock()
    Locked --> Locked: Reject all attempts

    note right of Locked
        Default: 5 attempts
        Lockout: 15 minutes
        Security event logged
    end note
```
