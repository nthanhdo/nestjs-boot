import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

const ALL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;

export function generateStatusCodeTests(
  endpoint: EndpointConfig,
  happyCase: RecordedResponse,
  config: ApiTestConfig,
): TestCase[] {
  const cases: TestCase[] = [];
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);

  // 200/201 — happy case (already recorded, replay for completeness)
  cases.push({
    id: nextId('status'),
    name: `${endpoint.method} ${endpoint.path} — 200/201 happy case`,
    category: 'status-codes' as TestCase['category'],
    description: 'Replay recorded happy case',
    request: { method: endpoint.method, url, headers, body: endpoint.body },
    expect: { status: [200, 201, 204] },
    mutation: 'Exact replay of recorded happy-case request',
  });

  // 400 — bad request (malformed body)
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    cases.push({
      id: nextId('status'),
      name: `${endpoint.method} ${endpoint.path} — 400 bad request`,
      category: 'status-codes' as TestCase['category'],
      description: 'Send malformed body to trigger 400',
      request: {
        method: endpoint.method, url,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: 'not-valid-json{{{',
      },
      expect: { status: [400, 422] },
      mutation: 'Send malformed/invalid body',
    });
  }

  // 401 — unauthorized (remove auth)
  if (config.auth && config.auth.type !== 'none') {
    const noAuthHeaders = clone(headers);
    delete noAuthHeaders['Authorization'];
    delete noAuthHeaders['Cookie'];
    if (config.auth.headerName) delete noAuthHeaders[config.auth.headerName];

    cases.push({
      id: nextId('status'),
      name: `${endpoint.method} ${endpoint.path} — 401 unauthorized`,
      category: 'status-codes' as TestCase['category'],
      description: 'Request without authentication to trigger 401',
      request: { method: endpoint.method, url, headers: noAuthHeaders, body: endpoint.body },
      expect: { status: [401, 403] },
      mutation: 'Removed all authentication credentials',
    });
  }

  // 403 — forbidden (invalid auth)
  if (config.auth && config.auth.type !== 'none') {
    const badAuthHeaders = clone(headers);
    if (config.auth.type === 'bearer') {
      badAuthHeaders['Authorization'] = 'Bearer fake-unauthorized-role-token';
    } else if (config.auth.type === 'api-key' && config.auth.headerName) {
      badAuthHeaders[config.auth.headerName] = 'wrong-role-key';
    }

    cases.push({
      id: nextId('status'),
      name: `${endpoint.method} ${endpoint.path} — 403 forbidden`,
      category: 'status-codes' as TestCase['category'],
      description: 'Request with wrong-role credentials to trigger 403',
      request: { method: endpoint.method, url, headers: badAuthHeaders, body: endpoint.body },
      expect: { status: [401, 403] },
      mutation: 'Used invalid/wrong-role credentials',
    });
  }

  // 404 — not found (invalid resource ID)
  const notFoundUrl = url.replace(/\/[^/]+$/, '/nonexistent-id-00000000');
  cases.push({
    id: nextId('status'),
    name: `${endpoint.method} ${endpoint.path} — 404 not found`,
    category: 'status-codes' as TestCase['category'],
    description: 'Request with non-existent resource ID to trigger 404',
    request: { method: endpoint.method, url: notFoundUrl, headers, body: endpoint.body },
    expect: { status: [404, 400] },
    mutation: 'Replaced resource ID with nonexistent value',
  });

  // 405 — method not allowed (wrong method)
  const wrongMethods = ALL_METHODS.filter(m => m !== endpoint.method && m !== 'OPTIONS' && m !== 'HEAD');
  if (wrongMethods.length > 0) {
    const wrongMethod = wrongMethods[0];
    cases.push({
      id: nextId('status'),
      name: `${endpoint.method} ${endpoint.path} — 405 method not allowed`,
      category: 'status-codes' as TestCase['category'],
      description: `Send ${wrongMethod} instead of ${endpoint.method} to trigger 405`,
      request: { method: wrongMethod, url, headers, body: endpoint.body },
      expect: { status: [405, 404, 400] },
      mutation: `Changed method from ${endpoint.method} to ${wrongMethod}`,
    });
  }

  // 409 — conflict (duplicate create for POST)
  if (endpoint.method === 'POST' && endpoint.body) {
    cases.push({
      id: nextId('status'),
      name: `POST ${endpoint.path} — 409 conflict (duplicate)`,
      category: 'status-codes' as TestCase['category'],
      description: 'Send same POST twice to trigger conflict on unique constraint',
      request: { method: 'POST', url, headers: { ...headers, 'Content-Type': 'application/json' }, body: endpoint.body },
      expect: { status: [409, 400, 422, 200, 201] },
      mutation: 'Duplicate POST with same payload (may conflict on unique fields)',
    });
  }

  // 422 — unprocessable entity (valid JSON, invalid data)
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    cases.push({
      id: nextId('status'),
      name: `${endpoint.method} ${endpoint.path} — 422 unprocessable`,
      category: 'status-codes' as TestCase['category'],
      description: 'Send valid JSON with empty required fields to trigger 422',
      request: {
        method: endpoint.method, url,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: {},
      },
      expect: { status: [422, 400] },
      mutation: 'Sent empty object as body (missing all required fields)',
    });
  }

  // 429 — rate limit (burst requests, informational)
  cases.push({
    id: nextId('status'),
    name: `${endpoint.method} ${endpoint.path} — 429 rate limit (informational)`,
    category: 'status-codes' as TestCase['category'],
    description: 'Informational: burst requests may trigger rate limiting',
    request: { method: endpoint.method, url, headers, body: endpoint.body },
    expect: { status: [200, 201, 204, 429] },
    mutation: 'Single request — actual rate limit test requires burst runner',
  });

  return cases;
}
