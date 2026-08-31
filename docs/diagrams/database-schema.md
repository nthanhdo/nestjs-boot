# Database Schema

> Entity-Relationship diagram for all persistable entities in nestjs-boot.
> These are framework interfaces — implement with Mongoose, Prisma, or any ORM.

## Full Schema

```mermaid
erDiagram
    User {
        string id PK
        string email UK
        string passwordHash
        string name
        string[] roles
        string[] permissions
        boolean emailVerified
        datetime createdAt
        datetime updatedAt
    }

    Organization {
        string id PK
        string name
        string code UK
        string description
        boolean isActive
        json metadata
        datetime createdAt
        datetime updatedAt
    }

    Department {
        string id PK
        string organizationId FK
        string parentId FK "self-ref for nesting"
        string name
        string code
        string description
        boolean isActive
        json metadata
        datetime createdAt
        datetime updatedAt
    }

    Team {
        string id PK
        string departmentId FK
        string organizationId FK
        string name
        string code
        string description
        boolean isActive
        json metadata
        datetime createdAt
        datetime updatedAt
    }

    UserOrgMembership {
        string userId FK
        string organizationId FK
        string departmentId FK "optional"
        string teamId FK "optional"
        string role "role within org"
        datetime joinedAt
    }

    Role {
        string code PK
        string name
        string description
        int level "privilege level"
        boolean isSystem
        string[] permissions
        string[] inherits "parent role codes"
    }

    Permission {
        string code PK
        string name
        string description
        string resource "e.g. user, task"
        string action "e.g. read, create"
    }

    UserRole {
        string userId FK
        string roleCode FK
    }

    UserPermission {
        string userId FK
        string permissionCode FK
    }

    RolePermission {
        string roleCode FK
        string permissionCode FK
    }

    RefreshToken {
        string tokenId PK
        string familyId "rotation chain"
        string userId FK
        boolean used
        datetime expiresAt
    }

    Session {
        string sessionId PK
        json data
        int createdAt "epoch ms"
        int lastAccessedAt "epoch ms"
    }

    AuditEntry {
        string id PK
        string actorId FK
        string action
        string resource
        string resourceId
        string result "ALLOW | DENY | ERROR"
        string organizationId FK "optional"
        string departmentId FK "optional"
        string ipAddress
        string userAgent
        datetime timestamp
        json metadata
    }

    SecurityEvent {
        string id PK
        string type "SecurityEventType enum"
        string severity "LOW | MED | HIGH | CRIT"
        string actorId FK "optional"
        string description
        string ipAddress
        string userAgent
        datetime timestamp
        json metadata
    }

    LoginAttempt {
        string identifier PK "email or IP"
        int count
        datetime lockedUntil "null if not locked"
    }

    Organization ||--o{ Department : "has"
    Department ||--o{ Department : "nested in"
    Department ||--o{ Team : "has"
    Organization ||--o{ Team : "belongs to"

    User ||--o{ UserOrgMembership : "joins"
    Organization ||--o{ UserOrgMembership : "has members"
    Department ||--o{ UserOrgMembership : "scoped to"
    Team ||--o{ UserOrgMembership : "scoped to"

    User ||--o{ UserRole : "assigned"
    Role ||--o{ UserRole : "granted to"
    User ||--o{ UserPermission : "direct grant"
    Permission ||--o{ UserPermission : "granted to"
    Role ||--o{ RolePermission : "includes"
    Permission ||--o{ RolePermission : "assigned to"
    Role ||--o{ Role : "inherits from"

    User ||--o{ RefreshToken : "owns"
    User ||--o{ AuditEntry : "performed"
    User ||--o{ SecurityEvent : "triggered"
    Organization ||--o{ AuditEntry : "scoped to"
```

## Scope & Access Model

```mermaid
erDiagram
    AccessScope {
        string name "OWN | TEAM | DEPT | ORG | SYSTEM"
        int level "10 | 20 | 30 | 40 | 50"
    }

    ScopeContext {
        string userId
        string organizationId
        string departmentId
        string teamId
    }

    AuthorizationContext {
        string userId
        string[] roles
        string[] permissions
        string action "e.g. task.read"
        string resource
        string resourceId
        string organizationId
        string departmentId
        string teamId
    }

    AuthorizationResult {
        boolean allowed
        string reason
        string matchedPermission
        string scope
        string policy
    }

    AuthorizationContext ||--|| AuthorizationResult : "evaluates to"
    ScopeContext ||--|| AccessScope : "resolves to"
```

## Healthcare Example

How a hospital maps to this schema:

```mermaid
erDiagram
    Hospital["Organization: City Hospital"] {
        string code "CITY_HOSP"
    }

    Cardiology["Department: Cardiology"] {
        string code "CARDIO"
    }

    Neurology["Department: Neurology"] {
        string code "NEURO"
    }

    TeamAlpha["Team: Alpha"] {
        string code "CARDIO_A"
    }

    DrSmith["User: Dr. Smith"] {
        string role "DOCTOR"
        string scope "DEPARTMENT"
    }

    NurseJones["User: Nurse Jones"] {
        string role "NURSE"
        string scope "DEPARTMENT"
    }

    AdminWilson["User: Admin Wilson"] {
        string role "ADMIN"
        string scope "ORGANIZATION"
    }

    Hospital ||--|| Cardiology : "has dept"
    Hospital ||--|| Neurology : "has dept"
    Cardiology ||--|| TeamAlpha : "has team"
    TeamAlpha ||--|| DrSmith : "member"
    Cardiology ||--|| NurseJones : "member"
    Hospital ||--|| AdminWilson : "member"
```

**Access rules:**
- Dr. Smith (DEPARTMENT scope) can read patients in Cardiology, NOT Neurology
- Nurse Jones (DEPARTMENT scope) can read patients in Cardiology
- Admin Wilson (ORGANIZATION scope) can manage users across the entire hospital
- SUPER_ADMIN (SYSTEM scope) has unrestricted access

## Notes

- All IDs should be UUID or another non-sequential identifier
- All entities include `createdAt` / `updatedAt` timestamps
- Foreign keys with "optional" can be null
- `metadata` fields are JSON blobs for domain-specific extensions
- The framework ships in-memory stores (`MemoryPermissionStore`, `MemoryOrganizationStore`, `MemoryAuditStore`, `MemoryTokenStore`) for dev/test. Production implementations use your ORM of choice.
