import type { ApiTestConfig, EndpointConfig, MutationModule, PayloadSchema, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

export const authMutations: MutationModule = {
  name: 'auth',
  generate(endpoint: EndpointConfig, happyCase: RecordedResponse, _schema: PayloadSchema | null, config: ApiTestConfig): TestCase[] {
    if (!config.auth || config.auth.type === 'none') return [];

    const cases: TestCase[] = [];
    const url = buildUrl(config, endpoint);
    const baseHeaders = buildHeaders(config, endpoint);

    // 1. Remove auth header entirely
    const noAuthHeaders = clone(baseHeaders);
    if (config.auth.type === 'bearer' || config.auth.type === 'basic') {
      delete noAuthHeaders['Authorization'];
    } else if (config.auth.type === 'api-key' && config.auth.headerName) {
      delete noAuthHeaders[config.auth.headerName];
    } else if (config.auth.type === 'cookie') {
      delete noAuthHeaders['Cookie'];
    }
    cases.push({
      id: nextId('auth'),
      name: `${endpoint.method} ${endpoint.path} — no auth`,
      category: 'auth',
      description: 'Request without authentication credentials',
      request: { method: endpoint.method, url, headers: noAuthHeaders, body: endpoint.body },
      expect: { status: [401, 403] },
      mutation: 'Removed authentication header/cookie',
    });

    // 2. Invalid/garbage token
    const garbageHeaders = clone(baseHeaders);
    if (config.auth.type === 'bearer') {
      garbageHeaders['Authorization'] = 'Bearer invalid-garbage-token-xyz';
    } else if (config.auth.type === 'api-key' && config.auth.headerName) {
      garbageHeaders[config.auth.headerName] = 'invalid-garbage-key';
    } else if (config.auth.type === 'basic') {
      garbageHeaders['Authorization'] = `Basic ${Buffer.from('fake:fake').toString('base64')}`;
    } else if (config.auth.type === 'cookie' && config.auth.cookieName) {
      garbageHeaders['Cookie'] = `${config.auth.cookieName}=invalid-cookie-value`;
    }
    cases.push({
      id: nextId('auth'),
      name: `${endpoint.method} ${endpoint.path} — invalid credentials`,
      category: 'auth',
      description: 'Request with invalid/garbage credentials',
      request: { method: endpoint.method, url, headers: garbageHeaders, body: endpoint.body },
      expect: { status: [401, 403] },
      mutation: 'Replaced credentials with garbage value',
    });

    // 3. Empty auth header value
    const emptyHeaders = clone(baseHeaders);
    if (config.auth.type === 'bearer') {
      emptyHeaders['Authorization'] = 'Bearer ';
    } else if (config.auth.type === 'api-key' && config.auth.headerName) {
      emptyHeaders[config.auth.headerName] = '';
    } else if (config.auth.type === 'basic') {
      emptyHeaders['Authorization'] = 'Basic ';
    }
    cases.push({
      id: nextId('auth'),
      name: `${endpoint.method} ${endpoint.path} — empty auth value`,
      category: 'auth',
      description: 'Request with empty authentication value',
      request: { method: endpoint.method, url, headers: emptyHeaders, body: endpoint.body },
      expect: { status: [401, 403] },
      mutation: 'Set authentication value to empty string',
    });

    // 4. Malformed JWT (bearer only)
    if (config.auth.type === 'bearer') {
      const malformedHeaders = clone(baseHeaders);
      malformedHeaders['Authorization'] = 'Bearer not-a-jwt-no-dots';
      cases.push({
        id: nextId('auth'),
        name: `${endpoint.method} ${endpoint.path} — malformed JWT`,
        category: 'auth',
        description: 'Request with malformed JWT (no dots)',
        request: { method: endpoint.method, url, headers: malformedHeaders, body: endpoint.body },
        expect: { status: [401, 403] },
        mutation: 'Replaced bearer token with non-JWT string (no dots)',
      });
    }

    return cases;
  },
};
