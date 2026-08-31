import { AuditStore, AuditEntry, SecurityEvent } from './interfaces';

export class MemoryAuditStore implements AuditStore {
  private auditEntries: AuditEntry[] = [];
  private securityEvents: SecurityEvent[] = [];
  private counter = 0;

  async saveAuditEntry(entry: AuditEntry): Promise<void> {
    this.auditEntries.push({ ...entry, id: entry.id ?? `audit_${++this.counter}` });
  }

  async findAuditEntries(filter: {
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
  }): Promise<AuditEntry[]> {
    let results = [...this.auditEntries];
    if (filter.actorId) results = results.filter((e) => e.actorId === filter.actorId);
    if (filter.action) results = results.filter((e) => e.action === filter.action);
    if (filter.resource) results = results.filter((e) => e.resource === filter.resource);
    if (filter.resourceId) results = results.filter((e) => e.resourceId === filter.resourceId);
    if (filter.result) results = results.filter((e) => e.result === filter.result);
    if (filter.organizationId) results = results.filter((e) => e.organizationId === filter.organizationId);
    if (filter.from) results = results.filter((e) => e.timestamp >= filter.from!);
    if (filter.to) results = results.filter((e) => e.timestamp <= filter.to!);
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async countAuditEntries(filter: Record<string, any>): Promise<number> {
    return (await this.findAuditEntries(filter)).length;
  }

  async purgeOlderThan(date: Date): Promise<{ auditEntriesDeleted: number; securityEventsDeleted: number }> {
    const auditBefore = this.auditEntries.length;
    this.auditEntries = this.auditEntries.filter((e) => e.timestamp >= date);
    const secBefore = this.securityEvents.length;
    this.securityEvents = this.securityEvents.filter((e) => e.timestamp >= date);
    return {
      auditEntriesDeleted: auditBefore - this.auditEntries.length,
      securityEventsDeleted: secBefore - this.securityEvents.length,
    };
  }

  async saveSecurityEvent(event: SecurityEvent): Promise<void> {
    this.securityEvents.push({ ...event, id: event.id ?? `sec_${++this.counter}` });
  }

  async findSecurityEvents(filter: {
    type?: string;
    severity?: string;
    actorId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<SecurityEvent[]> {
    let results = [...this.securityEvents];
    if (filter.type) results = results.filter((e) => e.type === filter.type);
    if (filter.severity) results = results.filter((e) => e.severity === filter.severity);
    if (filter.actorId) results = results.filter((e) => e.actorId === filter.actorId);
    if (filter.from) results = results.filter((e) => e.timestamp >= filter.from!);
    if (filter.to) results = results.filter((e) => e.timestamp <= filter.to!);
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return results.slice(offset, offset + limit);
  }
}
