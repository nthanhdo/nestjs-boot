import { AsyncLocalStorage } from 'async_hooks';
import { AuthContext } from './interfaces';

const storage = new AsyncLocalStorage<AuthContext>();

/**
 * Get the current auth context from AsyncLocalStorage.
 * Returns undefined if called outside a context.
 */
export function getAuthContext(): AuthContext | undefined {
  return storage.getStore();
}

/**
 * Set fields on the current auth context store.
 * Only works inside a `runWithAuthContext` callback.
 */
export function setAuthContext(ctx: Partial<AuthContext>): void {
  const store = storage.getStore();
  if (store) {
    if (ctx.token !== undefined) store.token = ctx.token;
    if (ctx.apiKey !== undefined) store.apiKey = ctx.apiKey;
    if (ctx.metadata) {
      store.metadata = { ...store.metadata, ...ctx.metadata };
    }
  }
}

/**
 * Run a function within an AsyncLocalStorage context with the given auth context.
 */
export function runWithAuthContext<T>(ctx: AuthContext, fn: () => T): T {
  return storage.run({ ...ctx }, fn);
}

/** @internal — exposed for interceptor use */
export const authContextStorage = storage;
