import { AuditStore, AuditEntry, SecurityEvent } from './interfaces';

/**
 * MongoDB-backed AuditStore implementation skeleton.
 *
 * This is an example showing how to implement the AuditStore interface
 * with MongoDB/Mongoose. It does NOT import mongoose — consumers should
 * adapt this pattern to their own Mongoose setup.
 *
 * Usage:
 * ```typescript
 * import { Module } from '@nestjs/common';
 * import { AuditModule } from 'nestjs-boot';
 * import { MongoAuditStore } from './mongo-audit.store';
 *
 * @Module({
 *   imports: [
 *     AuditModule.forRoot({ store: new MongoAuditStore(auditModel, securityModel) }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export class MongoAuditStore implements AuditStore {
  /**
   * @param auditModel - A Mongoose Model for audit entries (e.g. `mongoose.model('AuditEntry', auditEntrySchema)`)
   * @param securityModel - A Mongoose Model for security events
   */
  constructor(
    private readonly auditModel: any, // Mongoose Model<AuditEntry>
    private readonly securityModel: any, // Mongoose Model<SecurityEvent>
  ) {}

  async saveAuditEntry(entry: AuditEntry): Promise<void> {
    // await this.auditModel.create(entry);
    await this.auditModel.create(entry);
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
    const query: Record<string, any> = {};
    if (filter.actorId) query.actorId = filter.actorId;
    if (filter.action) query.action = filter.action;
    if (filter.resource) query.resource = filter.resource;
    if (filter.resourceId) query.resourceId = filter.resourceId;
    if (filter.result) query.result = filter.result;
    if (filter.organizationId) query.organizationId = filter.organizationId;
    if (filter.from || filter.to) {
      query.timestamp = {};
      if (filter.from) query.timestamp.$gte = filter.from;
      if (filter.to) query.timestamp.$lte = filter.to;
    }

    return this.auditModel
      .find(query)
      .sort({ timestamp: -1 })
      .skip(filter.offset ?? 0)
      .limit(filter.limit ?? 100)
      .lean()
      .exec();
  }

  async countAuditEntries(filter: Record<string, any>): Promise<number> {
    return this.auditModel.countDocuments(filter).exec();
  }

  async purgeOlderThan(date: Date): Promise<{ auditEntriesDeleted: number; securityEventsDeleted: number }> {
    const auditResult = await this.auditModel.deleteMany({ timestamp: { $lt: date } }).exec();
    const secResult = await this.securityModel.deleteMany({ timestamp: { $lt: date } }).exec();
    return {
      auditEntriesDeleted: auditResult.deletedCount ?? 0,
      securityEventsDeleted: secResult.deletedCount ?? 0,
    };
  }

  async saveSecurityEvent(event: SecurityEvent): Promise<void> {
    await this.securityModel.create(event);
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
    const query: Record<string, any> = {};
    if (filter.type) query.type = filter.type;
    if (filter.severity) query.severity = filter.severity;
    if (filter.actorId) query.actorId = filter.actorId;
    if (filter.from || filter.to) {
      query.timestamp = {};
      if (filter.from) query.timestamp.$gte = filter.from;
      if (filter.to) query.timestamp.$lte = filter.to;
    }

    return this.securityModel
      .find(query)
      .sort({ timestamp: -1 })
      .skip(filter.offset ?? 0)
      .limit(filter.limit ?? 100)
      .lean()
      .exec();
  }
}

/*
 * Example Mongoose schemas (for reference — define these in your app):
 *
 * const auditEntrySchema = new mongoose.Schema({
 *   actorId: { type: String, required: true, index: true },
 *   action: { type: String, required: true, index: true },
 *   resource: String,
 *   resourceId: String,
 *   result: { type: String, enum: ['ALLOW', 'DENY', 'ERROR'], required: true, index: true },
 *   organizationId: { type: String, index: true },
 *   departmentId: String,
 *   ipAddress: String,
 *   userAgent: String,
 *   timestamp: { type: Date, required: true, index: true },
 *   metadata: mongoose.Schema.Types.Mixed,
 *   previousHash: String,
 *   entryHash: { type: String, index: true },
 * }, { collection: 'audit_entries' });
 *
 * const securityEventSchema = new mongoose.Schema({
 *   type: { type: String, required: true, index: true },
 *   severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true, index: true },
 *   actorId: { type: String, index: true },
 *   description: { type: String, required: true },
 *   ipAddress: String,
 *   userAgent: String,
 *   timestamp: { type: Date, required: true, index: true },
 *   metadata: mongoose.Schema.Types.Mixed,
 * }, { collection: 'security_events' });
 */
