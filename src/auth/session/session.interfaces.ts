/**
 * SessionStore interface — pure abstraction. No forced Redis/DB.
 * User implements this for their preferred backend.
 */
export interface SessionStore {
  /** Get session data by ID. Returns null if not found or expired. */
  get(sessionId: string): Promise<SessionData | null>;

  /** Set/update session data. */
  set(sessionId: string, data: SessionData, maxAge?: number): Promise<void>;

  /** Destroy a session. */
  destroy(sessionId: string): Promise<void>;

  /** Touch (extend TTL) without modifying data. */
  touch(sessionId: string, maxAge?: number): Promise<void>;
}

export interface SessionData {
  [key: string]: any;
  /** When this session was created (epoch ms) */
  createdAt?: number;
  /** When this session was last accessed (epoch ms) */
  lastAccessedAt?: number;
}

export interface SessionModuleOptions {
  /** Session store implementation (default: MemorySessionStore — dev only!) */
  store?: SessionStore;
  /** Secret for signing session cookies */
  secret: string;
  /** Cookie name (default: 'boot.sid') */
  cookieName?: string;
  /** Session max age in milliseconds (default: 24h) */
  maxAge?: number;
  /** Whether the cookie is httpOnly (default: true) */
  httpOnly?: boolean;
  /** Whether the cookie is secure (default: false — set true in prod) */
  secure?: boolean;
  /** SameSite attribute (default: 'lax') */
  sameSite?: 'strict' | 'lax' | 'none';
}
