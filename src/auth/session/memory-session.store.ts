import { SessionStore, SessionData } from './session.interfaces';

/**
 * MemorySessionStore — in-memory session store for DEVELOPMENT ONLY.
 * Sessions are lost on restart. Do NOT use in production.
 */
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, { data: SessionData; expiresAt: number }>();

  async get(sessionId: string): Promise<SessionData | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return entry.data;
  }

  async set(sessionId: string, data: SessionData, maxAge?: number): Promise<void> {
    const ttl = maxAge ?? 86400000; // 24h default
    this.sessions.set(sessionId, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async touch(sessionId: string, maxAge?: number): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.expiresAt = Date.now() + (maxAge ?? 86400000);
    }
  }
}
