import { getAuthContext } from './auth-context.storage';
import { DEFAULT_AUTH_HEADER, DEFAULT_API_KEY_HEADER } from './constants';
import { InterServiceAuthOptions } from './interfaces';

/**
 * Builds headers/metadata to attach to outgoing inter-service calls.
 * Works with any transport — caller decides where to place the result.
 *
 * Usage in a custom ClientProxy wrapper or HttpService interceptor:
 *   const headers = buildAuthHeaders(options);
 *   // attach to outgoing request
 */
export function buildAuthHeaders(
  options?: Pick<InterServiceAuthOptions, 'headerName' | 'apiKeyHeaderName' | 'serviceToken'>,
): Record<string, string> {
  const ctx = getAuthContext();
  const headers: Record<string, string> = {};

  if (!ctx) {
    // No context — use service token if available
    if (options?.serviceToken) {
      const headerName = options.headerName ?? DEFAULT_AUTH_HEADER;
      headers[headerName] = `Bearer ${options.serviceToken}`;
    }
    return headers;
  }

  if (ctx.token) {
    const headerName = options?.headerName ?? DEFAULT_AUTH_HEADER;
    headers[headerName] = `Bearer ${ctx.token}`;
  }

  if (ctx.apiKey) {
    const apiKeyHeader = options?.apiKeyHeaderName ?? DEFAULT_API_KEY_HEADER;
    headers[apiKeyHeader] = ctx.apiKey;
  }

  // Propagate metadata
  if (ctx.metadata) {
    for (const [key, value] of Object.entries(ctx.metadata)) {
      headers[key] = value;
    }
  }

  return headers;
}

/**
 * Injects auth context into a message payload for non-HTTP transports (TCP/NATS/RMQ).
 * Adds an `__auth` field to the message data.
 */
export function injectAuthIntoPayload<T extends Record<string, any>>(
  data: T,
  options?: Pick<InterServiceAuthOptions, 'serviceToken'>,
): T & { __auth?: { token?: string; apiKey?: string; metadata?: Record<string, string> } } {
  const ctx = getAuthContext();

  if (!ctx && !options?.serviceToken) {
    return data;
  }

  const token = ctx?.token ?? options?.serviceToken;
  return {
    ...data,
    __auth: {
      token,
      apiKey: ctx?.apiKey,
      metadata: ctx?.metadata,
    },
  };
}
