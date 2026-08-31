import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MemoryAuditStore } from '../../src/audit/memory-audit.store';
import { AuditService } from '../../src/audit/audit.service';
import { AuditInterceptor } from '../../src/audit/audit.interceptor';
import { AUDIT_STORE, AUDIT_OPTIONS } from '../../src/audit/constants';
import { SecurityEventType } from '../../src/audit/interfaces';

// ─── MemoryAuditStore ──────────────────────────────────────────────────────

describe('MemoryAuditStore', () => {
  let store: MemoryAuditStore;

  beforeEach(() => {
    store = new MemoryAuditStore();
  });

  it('saves and retrieves an audit entry', async () => {
    const ts = new Date('2024-01-01T10:00:00Z');
    await store.saveAuditEntry({ actorId: 'user1', action: 'READ', result: 'ALLOW', timestamp: ts });
    const results = await store.findAuditEntries({});
    expect(results).toHaveLength(1);
    expect(results[0].actorId).toBe('user1');
    expect(results[0].id).toMatch(/^audit_/);
  });

  it('preserves explicit id', async () => {
    await store.saveAuditEntry({ id: 'my-id', actorId: 'u', action: 'X', result: 'ALLOW', timestamp: new Date() });
    const [entry] = await store.findAuditEntries({});
    expect(entry.id).toBe('my-id');
  });

  it('filters by actorId', async () => {
    const ts = new Date();
    await store.saveAuditEntry({ actorId: 'alice', action: 'READ', result: 'ALLOW', timestamp: ts });
    await store.saveAuditEntry({ actorId: 'bob', action: 'WRITE', result: 'DENY', timestamp: ts });
    const results = await store.findAuditEntries({ actorId: 'alice' });
    expect(results).toHaveLength(1);
    expect(results[0].actorId).toBe('alice');
  });

  it('filters by action', async () => {
    const ts = new Date();
    await store.saveAuditEntry({ actorId: 'u', action: 'DELETE', result: 'ALLOW', timestamp: ts });
    await store.saveAuditEntry({ actorId: 'u', action: 'READ', result: 'ALLOW', timestamp: ts });
    const results = await store.findAuditEntries({ action: 'DELETE' });
    expect(results).toHaveLength(1);
  });

  it('filters by resource and resourceId', async () => {
    const ts = new Date();
    await store.saveAuditEntry({ actorId: 'u', action: 'READ', resource: 'user', resourceId: '42', result: 'ALLOW', timestamp: ts });
    await store.saveAuditEntry({ actorId: 'u', action: 'READ', resource: 'role', resourceId: '7', result: 'ALLOW', timestamp: ts });
    const byResource = await store.findAuditEntries({ resource: 'user' });
    expect(byResource).toHaveLength(1);
    const byResourceId = await store.findAuditEntries({ resourceId: '7' });
    expect(byResourceId).toHaveLength(1);
    expect(byResourceId[0].resource).toBe('role');
  });

  it('filters by result', async () => {
    const ts = new Date();
    await store.saveAuditEntry({ actorId: 'u', action: 'A', result: 'ALLOW', timestamp: ts });
    await store.saveAuditEntry({ actorId: 'u', action: 'B', result: 'DENY', timestamp: ts });
    const denials = await store.findAuditEntries({ result: 'DENY' });
    expect(denials).toHaveLength(1);
    expect(denials[0].action).toBe('B');
  });

  it('filters by organizationId', async () => {
    const ts = new Date();
    await store.saveAuditEntry({ actorId: 'u', action: 'A', result: 'ALLOW', organizationId: 'org1', timestamp: ts });
    await store.saveAuditEntry({ actorId: 'u', action: 'B', result: 'ALLOW', organizationId: 'org2', timestamp: ts });
    const results = await store.findAuditEntries({ organizationId: 'org1' });
    expect(results).toHaveLength(1);
  });

  it('filters by from/to date range', async () => {
    const t1 = new Date('2024-01-01T00:00:00Z');
    const t2 = new Date('2024-06-01T00:00:00Z');
    const t3 = new Date('2024-12-01T00:00:00Z');
    await store.saveAuditEntry({ actorId: 'u', action: 'A', result: 'ALLOW', timestamp: t1 });
    await store.saveAuditEntry({ actorId: 'u', action: 'B', result: 'ALLOW', timestamp: t2 });
    await store.saveAuditEntry({ actorId: 'u', action: 'C', result: 'ALLOW', timestamp: t3 });
    const results = await store.findAuditEntries({
      from: new Date('2024-03-01T00:00:00Z'),
      to: new Date('2024-09-01T00:00:00Z'),
    });
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('B');
  });

  it('sorts by timestamp descending', async () => {
    const t1 = new Date('2024-01-01T00:00:00Z');
    const t2 = new Date('2024-06-01T00:00:00Z');
    await store.saveAuditEntry({ actorId: 'u', action: 'FIRST', result: 'ALLOW', timestamp: t1 });
    await store.saveAuditEntry({ actorId: 'u', action: 'SECOND', result: 'ALLOW', timestamp: t2 });
    const results = await store.findAuditEntries({});
    expect(results[0].action).toBe('SECOND');
    expect(results[1].action).toBe('FIRST');
  });

  it('applies offset and limit', async () => {
    const ts = new Date();
    for (let i = 0; i < 5; i++) {
      await store.saveAuditEntry({ actorId: 'u', action: `A${i}`, result: 'ALLOW', timestamp: ts });
    }
    const results = await store.findAuditEntries({ limit: 2, offset: 1 });
    expect(results).toHaveLength(2);
  });

  it('countAuditEntries returns correct count', async () => {
    const ts = new Date();
    await store.saveAuditEntry({ actorId: 'alice', action: 'X', result: 'ALLOW', timestamp: ts });
    await store.saveAuditEntry({ actorId: 'bob', action: 'X', result: 'ALLOW', timestamp: ts });
    const count = await store.countAuditEntries({ actorId: 'alice' });
    expect(count).toBe(1);
  });

  it('saves and retrieves security events', async () => {
    const ts = new Date();
    await store.saveSecurityEvent({
      type: SecurityEventType.LOGIN,
      severity: 'LOW',
      description: 'User logged in',
      timestamp: ts,
    });
    const results = await store.findSecurityEvents({});
    expect(results).toHaveLength(1);
    expect(results[0].id).toMatch(/^sec_/);
  });

  it('filters security events by type', async () => {
    const ts = new Date();
    await store.saveSecurityEvent({ type: SecurityEventType.LOGIN, severity: 'LOW', description: 'Login', timestamp: ts });
    await store.saveSecurityEvent({ type: SecurityEventType.LOGIN_FAILED, severity: 'MEDIUM', description: 'Failed', timestamp: ts });
    const results = await store.findSecurityEvents({ type: SecurityEventType.LOGIN_FAILED });
    expect(results).toHaveLength(1);
  });

  it('filters security events by severity', async () => {
    const ts = new Date();
    await store.saveSecurityEvent({ type: 'X', severity: 'LOW', description: 'low', timestamp: ts });
    await store.saveSecurityEvent({ type: 'Y', severity: 'CRITICAL', description: 'crit', timestamp: ts });
    const results = await store.findSecurityEvents({ severity: 'CRITICAL' });
    expect(results).toHaveLength(1);
  });

  it('filters security events by actorId', async () => {
    const ts = new Date();
    await store.saveSecurityEvent({ type: 'X', severity: 'LOW', actorId: 'alice', description: 'd', timestamp: ts });
    await store.saveSecurityEvent({ type: 'X', severity: 'LOW', actorId: 'bob', description: 'd', timestamp: ts });
    const results = await store.findSecurityEvents({ actorId: 'alice' });
    expect(results).toHaveLength(1);
  });

  it('sorts security events by timestamp descending', async () => {
    const t1 = new Date('2024-01-01T00:00:00Z');
    const t2 = new Date('2024-06-01T00:00:00Z');
    await store.saveSecurityEvent({ type: 'A', severity: 'LOW', description: 'first', timestamp: t1 });
    await store.saveSecurityEvent({ type: 'B', severity: 'LOW', description: 'second', timestamp: t2 });
    const results = await store.findSecurityEvents({});
    expect(results[0].type).toBe('B');
  });
});

// ─── AuditService ──────────────────────────────────────────────────────────

function makeService(overrideOptions: Record<string, any> = {}) {
  const store = new MemoryAuditStore();
  const options = { ...overrideOptions };
  // Manually inject — mirrors NestJS DI without bootstrapping the whole container
  const service = new (AuditService as any)(store, options) as AuditService;
  return { service, store };
}

describe('AuditService', () => {
  it('log() saves entry with timestamp', async () => {
    const { service, store } = makeService();
    await service.log({ actorId: 'u1', action: 'READ', result: 'ALLOW' });
    const entries = await store.findAuditEntries({});
    expect(entries).toHaveLength(1);
    expect(entries[0].actorId).toBe('u1');
    expect(entries[0].timestamp).toBeInstanceOf(Date);
  });

  it('logAccess() saves ALLOW entry', async () => {
    const { service, store } = makeService();
    await service.logAccess('u1', 'READ', 'post', '99');
    const entries = await store.findAuditEntries({ result: 'ALLOW' });
    expect(entries).toHaveLength(1);
    expect(entries[0].resource).toBe('post');
    expect(entries[0].resourceId).toBe('99');
  });

  it('logDenial() saves DENY entry', async () => {
    const { service, store } = makeService();
    await service.logDenial('u1', 'DELETE', 'post', '1');
    const entries = await store.findAuditEntries({ result: 'DENY' });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('DELETE');
  });

  it('logSecurityEvent() saves event with timestamp', async () => {
    const { service, store } = makeService();
    await service.logSecurityEvent({
      type: SecurityEventType.LOGIN_FAILED,
      severity: 'MEDIUM',
      description: 'Bad password',
    });
    const events = await store.findSecurityEvents({});
    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBeInstanceOf(Date);
  });

  it('findAuditEntries() delegates to store', async () => {
    const { service, store } = makeService();
    const ts = new Date();
    await store.saveAuditEntry({ actorId: 'x', action: 'Y', result: 'ALLOW', timestamp: ts });
    const results = await service.findAuditEntries({ actorId: 'x' });
    expect(results).toHaveLength(1);
  });

  it('findSecurityEvents() delegates to store', async () => {
    const { service, store } = makeService();
    const ts = new Date();
    await store.saveSecurityEvent({ type: 'Z', severity: 'HIGH', description: 'test', timestamp: ts });
    const results = await service.findSecurityEvents({ severity: 'HIGH' });
    expect(results).toHaveLength(1);
  });

  describe('extractRequestContext()', () => {
    it('extracts actorId from user.sub', () => {
      const { service } = makeService();
      const req = { user: { sub: 'sub123' }, ip: '1.2.3.4', headers: { 'user-agent': 'TestBrowser' } };
      const ctx = service.extractRequestContext(req);
      expect(ctx.actorId).toBe('sub123');
      expect(ctx.ipAddress).toBe('1.2.3.4');
      expect(ctx.userAgent).toBe('TestBrowser');
    });

    it('falls back to user.id when sub absent', () => {
      const { service } = makeService();
      const req = { user: { id: 'id456' }, ip: '5.6.7.8', headers: {} };
      const ctx = service.extractRequestContext(req);
      expect(ctx.actorId).toBe('id456');
    });

    it('falls back to "anonymous" when no user', () => {
      const { service } = makeService();
      const req = { user: {}, ip: undefined, headers: {} };
      const ctx = service.extractRequestContext(req);
      expect(ctx.actorId).toBe('anonymous');
    });

    it('uses custom extractIp and extractUserAgent', () => {
      const { service } = makeService({
        extractIp: () => '9.9.9.9',
        extractUserAgent: () => 'CustomAgent',
      });
      const req = { user: { sub: 'u' }, headers: {} };
      const ctx = service.extractRequestContext(req);
      expect(ctx.ipAddress).toBe('9.9.9.9');
      expect(ctx.userAgent).toBe('CustomAgent');
    });

    it('includes organizationId from user', () => {
      const { service } = makeService();
      const req = { user: { sub: 'u', organizationId: 'org99' }, headers: {} };
      const ctx = service.extractRequestContext(req);
      expect(ctx.organizationId).toBe('org99');
    });
  });
});

// ─── AuditInterceptor ─────────────────────────────────────────────────────

function createMockContext(request: Record<string, any> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as any;
}

describe('AuditInterceptor', () => {
  it('logs denial and re-throws ForbiddenException', async () => {
    const { service } = makeService();
    const logDenialSpy = vi.spyOn(service, 'logDenial').mockResolvedValue(undefined);
    const interceptor = new AuditInterceptor(service);

    const error = new ForbiddenException('no access');
    const ctx = createMockContext({ method: 'GET', url: '/secret', user: { sub: 'u1' }, headers: {} });
    const handler = { handle: () => throwError(() => error) } as any;

    await expect(
      new Promise((_, reject) => {
        interceptor.intercept(ctx, handler).subscribe({ error: reject });
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Give fire-and-forget a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(logDenialSpy).toHaveBeenCalledWith('u1', 'GET /secret', undefined, undefined, expect.any(Object));
  });

  it('logs denial on UnauthorizedException', async () => {
    const { service } = makeService();
    const logDenialSpy = vi.spyOn(service, 'logDenial').mockResolvedValue(undefined);
    const interceptor = new AuditInterceptor(service);

    const error = new UnauthorizedException();
    const ctx = createMockContext({ method: 'POST', url: '/admin', user: {}, headers: {} });
    const handler = { handle: () => throwError(() => error) } as any;

    await expect(
      new Promise((_, reject) => {
        interceptor.intercept(ctx, handler).subscribe({ error: reject });
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await new Promise((r) => setTimeout(r, 0));
    expect(logDenialSpy).toHaveBeenCalled();
  });

  it('does not log denial for other errors', async () => {
    const { service } = makeService();
    const logDenialSpy = vi.spyOn(service, 'logDenial').mockResolvedValue(undefined);
    const interceptor = new AuditInterceptor(service);

    const error = new Error('generic');
    const ctx = createMockContext({ method: 'GET', url: '/data', user: { sub: 'u' }, headers: {} });
    const handler = { handle: () => throwError(() => error) } as any;

    await expect(
      new Promise((_, reject) => {
        interceptor.intercept(ctx, handler).subscribe({ error: reject });
      }),
    ).rejects.toThrow('generic');

    await new Promise((r) => setTimeout(r, 0));
    expect(logDenialSpy).not.toHaveBeenCalled();
  });

  it('passes through successful responses unchanged', async () => {
    const { service } = makeService();
    const interceptor = new AuditInterceptor(service);

    const ctx = createMockContext({ user: {}, headers: {} });
    const handler = { handle: () => of({ data: 'ok' }) } as any;

    const result = await new Promise((resolve) => {
      interceptor.intercept(ctx, handler).subscribe(resolve);
    });

    expect(result).toEqual({ data: 'ok' });
  });
});
