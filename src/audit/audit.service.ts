import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { AUDIT_STORE, AUDIT_OPTIONS } from './constants';
import { AuditStore, AuditEntry, SecurityEvent, AuditModuleOptions } from './interfaces';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private lastHash: string | undefined;

  constructor(
    @Inject(AUDIT_STORE) private readonly store: AuditStore,
    @Inject(AUDIT_OPTIONS) private readonly options: AuditModuleOptions,
  ) {}

  /** Compute SHA-256 hash of an audit entry (excluding entryHash field) */
  private computeHash(entry: Omit<AuditEntry, 'entryHash'>): string {
    const payload = JSON.stringify(entry);
    return createHash('sha256').update(payload).digest('hex');
  }

  /** Log an audit entry with hash chain for tamper-proofing */
  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date(),
      previousHash: this.lastHash,
    };
    fullEntry.entryHash = this.computeHash(fullEntry);
    this.lastHash = fullEntry.entryHash;
    await this.store.saveAuditEntry(fullEntry);
    this.logger.debug(
      `Audit: ${entry.actorId} ${entry.action} ${entry.resource ?? ''}${entry.resourceId ? ':' + entry.resourceId : ''} → ${entry.result}`,
    );
  }

  /** Log an access grant */
  async logAccess(
    actorId: string,
    action: string,
    resource?: string,
    resourceId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.log({ actorId, action, resource, resourceId, result: 'ALLOW', metadata });
  }

  /** Log an access denial */
  async logDenial(
    actorId: string,
    action: string,
    resource?: string,
    resourceId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.log({ actorId, action, resource, resourceId, result: 'DENY', metadata });
  }

  /** Log a security event */
  async logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): Promise<void> {
    const fullEvent: SecurityEvent = { ...event, timestamp: new Date() };
    await this.store.saveSecurityEvent(fullEvent);
    if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
      this.logger.warn(`Security [${event.severity}]: ${event.type} — ${event.description}`);
    }
  }

  /** Query audit entries */
  async findAuditEntries(filter: Parameters<AuditStore['findAuditEntries']>[0]): Promise<AuditEntry[]> {
    return this.store.findAuditEntries(filter);
  }

  /** Query security events */
  async findSecurityEvents(filter: Parameters<AuditStore['findSecurityEvents']>[0]): Promise<SecurityEvent[]> {
    return this.store.findSecurityEvents(filter);
  }

  /** Extract audit context from HTTP request */
  extractRequestContext(request: any): {
    actorId: string;
    ipAddress?: string;
    userAgent?: string;
    organizationId?: string;
  } {
    const user = request.user ?? {};
    const extractIp = this.options.extractIp ?? ((req: any) => req.ip ?? req.connection?.remoteAddress);
    const extractUa = this.options.extractUserAgent ?? ((req: any) => req.headers?.['user-agent']);
    return {
      actorId: user.sub ?? user.id ?? 'anonymous',
      ipAddress: extractIp(request),
      userAgent: extractUa(request),
      organizationId: user.organizationId,
    };
  }
}
