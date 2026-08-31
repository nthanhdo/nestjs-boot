# Audit API Reference

> Structured audit logging and security event tracking with a pluggable store. Automatically captures authorization denials via a global interceptor.

## Module Registration

```ts
AuditModule.register(options?: AuditModuleOptions): DynamicModule
```

`AuditModule` is `global: true`. Registers `AuditService` and (by default) `AuditInterceptor` as global providers. Register once in your root `AppModule`.

```ts
import { AuditModule } from '@nestjs-boot/audit';

// Development — in-memory store, automatic denial logging
AuditModule.register()

// Production — custom store, custom IP/UA extractors
AuditModule.register({
  store: new MongoAuditStore(model),
  logDenials: true,
  extractIp: (req) => req.headers['x-forwarded-for']?.split(',')[0] ?? req.ip,
  extractUserAgent: (req) => req.headers['user-agent'],
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `AuditStore` | `MemoryAuditStore` | Persistence backend for audit entries and security events |
| `logDenials` | `boolean` | `true` | When `true`, registers `AuditInterceptor` globally to auto-log `403`/`401` responses |
| `extractIp` | `(req) => string` | `req.ip` | Custom extractor for client IP address |
| `extractUserAgent` | `(req) => string` | `req.headers['user-agent']` | Custom extractor for client user agent |

---

## Classes

### `AuditService`

> Core service for recording audit entries and security events.

Injectable via class token. Exported from `AuditModule`.

#### Methods

##### `log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void>`

Record an audit entry. Automatically sets `timestamp` to `new Date()`.

```ts
await auditService.log({
  actorId: 'user-123',
  action: 'report.export',
  resource: 'report',
  resourceId: 'rpt-456',
  result: 'ALLOW',
  organizationId: 'org-789',
});
```

##### `logAccess(actorId, action, resource?, resourceId?, metadata?): Promise<void>`

Shorthand for `log()` with `result: 'ALLOW'`.

##### `logDenial(actorId, action, resource?, resourceId?, metadata?): Promise<void>`

Shorthand for `log()` with `result: 'DENY'`.

##### `logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): Promise<void>`

Record a security event. Automatically sets `timestamp`. Logs a `warn` to the NestJS logger for `HIGH` or `CRITICAL` severity events.

```ts
await auditService.logSecurityEvent({
  type: SecurityEventType.REFRESH_TOKEN_REUSE,
  severity: 'CRITICAL',
  actorId: userId,
  description: 'Refresh token reuse detected — family revoked',
  ipAddress: '1.2.3.4',
});
```

##### `findAuditEntries(filter): Promise<AuditEntry[]>`

Query audit log entries. Delegates to `AuditStore.findAuditEntries()`.

| Filter field | Type | Description |
|---|---|---|
| `actorId` | `string` | Filter by actor |
| `action` | `string` | Filter by action string |
| `resource` | `string` | Filter by resource type |
| `resourceId` | `string` | Filter by specific resource ID |
| `result` | `'ALLOW' \| 'DENY' \| 'ERROR'` | Filter by result |
| `organizationId` | `string` | Filter by organization context |
| `from` | `Date` | Entries at or after this timestamp |
| `to` | `Date` | Entries at or before this timestamp |
| `limit` | `number` | Max entries to return (default: 100) |
| `offset` | `number` | Skip N entries (default: 0) |

##### `findSecurityEvents(filter): Promise<SecurityEvent[]>`

Query security events. Delegates to `AuditStore.findSecurityEvents()`.

| Filter field | Type | Description |
|---|---|---|
| `type` | `string` | Filter by event type |
| `severity` | `'LOW' \| 'MEDIUM' \| 'HIGH' \| 'CRITICAL'` | Filter by severity |
| `actorId` | `string` | Filter by actor |
| `from` | `Date` | Events at or after this timestamp |
| `to` | `Date` | Events at or before this timestamp |
| `limit` | `number` | Max events to return (default: 100) |
| `offset` | `number` | Skip N events (default: 0) |

##### `extractRequestContext(request: any): { actorId, ipAddress?, userAgent?, organizationId? }`

Extract common audit context from an HTTP request. Reads `req.user` for actor and org context; uses `options.extractIp` / `options.extractUserAgent` for network context. Returns `'anonymous'` for `actorId` when no authenticated user is present.

---

### `AuditInterceptor`

> Global NestJS interceptor that automatically records `403 ForbiddenException` and `401 UnauthorizedException` responses as audit denials.

Registered globally via `APP_INTERCEPTOR` when `AuditModuleOptions.logDenials !== false`. Uses `AuditService.logDenial()` with `actorId`, IP, user agent, and the request method + URL as the action string. Fires-and-forgets — does not delay the error response.

---

### `MemoryAuditStore`

> In-memory `AuditStore` implementation. **Not for production use** — data resets on restart.

Instantiated automatically when no `store` is provided. IDs are auto-generated as `audit_N` and `sec_N`. `findAuditEntries()` and `findSecurityEvents()` return results sorted by timestamp descending.

---

## Enum

### `SecurityEventType`

Pre-defined security event type constants. You may also pass any custom string to `SecurityEvent.type`.

```ts
enum SecurityEventType {
  LOGIN                      = 'LOGIN',
  LOGIN_FAILED               = 'LOGIN_FAILED',
  LOGOUT                     = 'LOGOUT',
  USER_CREATED               = 'USER_CREATED',
  USER_UPDATED               = 'USER_UPDATED',
  USER_DISABLED              = 'USER_DISABLED',
  ROLE_ASSIGNED              = 'ROLE_ASSIGNED',
  ROLE_REMOVED               = 'ROLE_REMOVED',
  PERMISSION_CHANGED         = 'PERMISSION_CHANGED',
  AUTHORIZATION_DENIED       = 'AUTHORIZATION_DENIED',
  RESOURCE_ACCESSED          = 'RESOURCE_ACCESSED',
  RESOURCE_UPDATED           = 'RESOURCE_UPDATED',
  RESOURCE_EXPORTED          = 'RESOURCE_EXPORTED',
  MULTIPLE_LOGIN_FAILURES    = 'MULTIPLE_LOGIN_FAILURES',
  ACCOUNT_LOCKED             = 'ACCOUNT_LOCKED',
  REFRESH_TOKEN_REUSE        = 'REFRESH_TOKEN_REUSE',
  SESSION_REVOKED            = 'SESSION_REVOKED',
  SUSPICIOUS_ACCESS          = 'SUSPICIOUS_ACCESS',
  PRIVILEGE_ESCALATION_ATTEMPT = 'PRIVILEGE_ESCALATION_ATTEMPT',
}
```

---

## Interfaces

### `AuditEntry`

```ts
interface AuditEntry {
  id?: string;
  actorId: string;
  action: string;           // E.g. 'user.create', 'GET /reports/123'
  resource?: string;        // Resource type (e.g. 'user', 'report')
  resourceId?: string;
  result: 'ALLOW' | 'DENY' | 'ERROR';
  organizationId?: string;
  departmentId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}
```

### `SecurityEvent`

```ts
interface SecurityEvent {
  id?: string;
  type: SecurityEventType | string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actorId?: string;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}
```

### `AuditStore`

Implement this interface to persist audit data in your own database.

```ts
interface AuditStore {
  saveAuditEntry(entry: AuditEntry): Promise<void>;
  findAuditEntries(filter: { actorId?; action?; resource?; resourceId?; result?; organizationId?; from?; to?; limit?; offset? }): Promise<AuditEntry[]>;
  countAuditEntries(filter: Record<string, any>): Promise<number>;

  saveSecurityEvent(event: SecurityEvent): Promise<void>;
  findSecurityEvents(filter: { type?; severity?; actorId?; from?; to?; limit?; offset? }): Promise<SecurityEvent[]>;
}
```

### `AuditModuleOptions`

```ts
interface AuditModuleOptions {
  store?: AuditStore;
  logDenials?: boolean;
  extractIp?: (request: any) => string;
  extractUserAgent?: (request: any) => string;
}
```

---

## Constants / Tokens

| Token | Value | Description |
|-------|-------|-------------|
| `AUDIT_STORE` | `'BOOT_AUDIT_STORE'` | Injection token for the `AuditStore` instance |
| `AUDIT_OPTIONS` | `'BOOT_AUDIT_OPTIONS'` | Injection token for `AuditModuleOptions` |
