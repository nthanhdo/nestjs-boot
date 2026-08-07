import { AsyncLocalStorage } from 'async_hooks';

interface CorrelationStore {
  correlationId: string;
  traceparent?: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

/**
 * Get the current correlation ID from AsyncLocalStorage context.
 */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Set the correlation ID on the current AsyncLocalStorage store.
 * Only works inside a `runWithCorrelationId` callback.
 */
export function setCorrelationId(id: string): void {
  const store = storage.getStore();
  if (store) {
    store.correlationId = id;
  }
}

/**
 * Run a function within an AsyncLocalStorage context that has the given correlation ID.
 */
export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return storage.run({ correlationId: id }, fn);
}

/**
 * Get the current W3C traceparent from AsyncLocalStorage context.
 */
export function getTraceparent(): string | undefined {
  return storage.getStore()?.traceparent;
}

/** @internal — exposed for middleware use */
export const correlationStorage = storage;
