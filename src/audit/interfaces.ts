export interface AuditEntry {
  id?: string;
  /** Who performed the action */
  actorId: string;
  /** What action was performed (e.g. 'user.create', 'LOGIN', 'ROLE_ASSIGNED') */
  action: string;
  /** Resource type (e.g. 'user', 'role', 'session') */
  resource?: string;
  /** Specific resource ID */
  resourceId?: string;
  /** Result of the action */
  result: 'ALLOW' | 'DENY' | 'ERROR';
  /** Organization context */
  organizationId?: string;
  /** Department context */
  departmentId?: string;
  /** Client IP address */
  ipAddress?: string;
  /** Client user agent */
  userAgent?: string;
  /** When it happened */
  timestamp: Date;
  /** Additional structured data */
  metadata?: Record<string, any>;
}

export enum SecurityEventType {
  LOGIN = 'LOGIN',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DISABLED = 'USER_DISABLED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REMOVED = 'ROLE_REMOVED',
  PERMISSION_CHANGED = 'PERMISSION_CHANGED',
  AUTHORIZATION_DENIED = 'AUTHORIZATION_DENIED',
  RESOURCE_ACCESSED = 'RESOURCE_ACCESSED',
  RESOURCE_UPDATED = 'RESOURCE_UPDATED',
  RESOURCE_EXPORTED = 'RESOURCE_EXPORTED',
  MULTIPLE_LOGIN_FAILURES = 'MULTIPLE_LOGIN_FAILURES',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  REFRESH_TOKEN_REUSE = 'REFRESH_TOKEN_REUSE',
  SESSION_REVOKED = 'SESSION_REVOKED',
  SUSPICIOUS_ACCESS = 'SUSPICIOUS_ACCESS',
  PRIVILEGE_ESCALATION_ATTEMPT = 'PRIVILEGE_ESCALATION_ATTEMPT',
}

export interface SecurityEvent {
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

/**
 * AuditStore — abstraction for audit log persistence.
 */
export interface AuditStore {
  saveAuditEntry(entry: AuditEntry): Promise<void>;
  findAuditEntries(filter: {
    actorId?: string;
    action?: string;
    resource?: string;
    resourceId?: string;
    result?: string;
    organizationId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditEntry[]>;
  countAuditEntries(filter: Record<string, any>): Promise<number>;

  saveSecurityEvent(event: SecurityEvent): Promise<void>;
  findSecurityEvents(filter: {
    type?: string;
    severity?: string;
    actorId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<SecurityEvent[]>;
}

export interface AuditModuleOptions {
  store?: AuditStore;
  /** Auto-log all guard denials. Default: true */
  logDenials?: boolean;
  /** Function to extract IP from request */
  extractIp?: (request: any) => string;
  /** Function to extract user agent from request */
  extractUserAgent?: (request: any) => string;
}
