import { describe, it, expect } from 'vitest';
import { of, lastValueFrom } from 'rxjs';
import {
  getAuthContext,
  setAuthContext,
  runWithAuthContext,
} from '../../src/inter-service-auth/auth-context.storage';
import {
  buildAuthHeaders,
  injectAuthIntoPayload,
} from '../../src/inter-service-auth/auth-client.interceptor';
import { AuthPropagationInterceptor } from '../../src/inter-service-auth/auth-propagation.interceptor';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

function createMockHttpContext(headers: Record<string, string> = {}): ExecutionContext {
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: lowerHeaders }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    switchToRpc: () => { throw new Error('Not RPC'); },
    switchToWs: () => { throw new Error('Not WS'); },
    getHandler: () => () => {},
    getClass: () => Object,
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => null,
  } as unknown as ExecutionContext;
}

describe('InterServiceAuth — AsyncLocalStorage', () => {
  it('should return undefined outside context', () => {
    expect(getAuthContext()).toBeUndefined();
  });

  it('should store and retrieve auth context', () => {
    runWithAuthContext({ token: 'abc', apiKey: 'key123' }, () => {
      const ctx = getAuthContext();
      expect(ctx).toBeDefined();
      expect(ctx!.token).toBe('abc');
      expect(ctx!.apiKey).toBe('key123');
    });
  });

  it('should allow updating context with setAuthContext', () => {
    runWithAuthContext({ token: 'original' }, () => {
      setAuthContext({ apiKey: 'added-key', metadata: { foo: 'bar' } });
      const ctx = getAuthContext();
      expect(ctx!.token).toBe('original');
      expect(ctx!.apiKey).toBe('added-key');
      expect(ctx!.metadata).toEqual({ foo: 'bar' });
    });
  });
});

describe('AuthPropagationInterceptor', () => {
  it('should extract JWT from incoming request into context', async () => {
    const interceptor = new AuthPropagationInterceptor({ propagation: 'jwt' });
    const context = createMockHttpContext({ Authorization: 'Bearer my-jwt-token' });

    let capturedToken: string | undefined;
    const handler: CallHandler = {
      handle: () => {
        capturedToken = getAuthContext()?.token;
        return of('done');
      },
    };

    await lastValueFrom(interceptor.intercept(context, handler));
    expect(capturedToken).toBe('my-jwt-token');
  });

  it('should extract API key from incoming request into context', async () => {
    const interceptor = new AuthPropagationInterceptor({ propagation: 'api-key' });
    const context = createMockHttpContext({ 'x-api-key': 'secret-api-key' });

    let capturedApiKey: string | undefined;
    const handler: CallHandler = {
      handle: () => {
        capturedApiKey = getAuthContext()?.apiKey;
        return of('done');
      },
    };

    await lastValueFrom(interceptor.intercept(context, handler));
    expect(capturedApiKey).toBe('secret-api-key');
  });

  it('should extract both JWT and API key when propagation=both', async () => {
    const interceptor = new AuthPropagationInterceptor({ propagation: 'both' });
    const context = createMockHttpContext({
      Authorization: 'Bearer dual-token',
      'x-api-key': 'dual-key',
    });

    let capturedToken: string | undefined;
    let capturedApiKey: string | undefined;
    const handler: CallHandler = {
      handle: () => {
        const ctx = getAuthContext();
        capturedToken = ctx?.token;
        capturedApiKey = ctx?.apiKey;
        return of('done');
      },
    };

    await lastValueFrom(interceptor.intercept(context, handler));
    expect(capturedToken).toBe('dual-token');
    expect(capturedApiKey).toBe('dual-key');
  });

  it('should use service token when no user context present', async () => {
    const interceptor = new AuthPropagationInterceptor({
      propagation: 'jwt',
      serviceToken: 'svc-fallback-token',
    });
    const context = createMockHttpContext({});

    let capturedToken: string | undefined;
    const handler: CallHandler = {
      handle: () => {
        capturedToken = getAuthContext()?.token;
        return of('done');
      },
    };

    await lastValueFrom(interceptor.intercept(context, handler));
    expect(capturedToken).toBe('svc-fallback-token');
  });
});

describe('buildAuthHeaders', () => {
  it('should build headers from auth context', () => {
    runWithAuthContext({ token: 'tok', apiKey: 'key', metadata: { 'x-custom': 'val' } }, () => {
      const headers = buildAuthHeaders();
      expect(headers['Authorization']).toBe('Bearer tok');
      expect(headers['x-api-key']).toBe('key');
      expect(headers['x-custom']).toBe('val');
    });
  });

  it('should use service token when no context', () => {
    const headers = buildAuthHeaders({ serviceToken: 'svc-tok' });
    expect(headers['Authorization']).toBe('Bearer svc-tok');
  });
});

describe('injectAuthIntoPayload', () => {
  it('should inject auth into message payload', () => {
    runWithAuthContext({ token: 'msg-tok', apiKey: 'msg-key' }, () => {
      const result = injectAuthIntoPayload({ action: 'test' });
      expect(result.action).toBe('test');
      expect(result.__auth?.token).toBe('msg-tok');
      expect(result.__auth?.apiKey).toBe('msg-key');
    });
  });

  it('should not add __auth when no context and no service token', () => {
    const result = injectAuthIntoPayload({ action: 'test' });
    expect(result.__auth).toBeUndefined();
  });
});
