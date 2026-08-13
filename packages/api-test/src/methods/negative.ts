import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

function buildDeepObject(depth: number): unknown {
  if (depth <= 0) return 'leaf';
  return { nested: buildDeepObject(depth - 1) };
}

export function generateNegativeTests(
  endpoint: EndpointConfig,
  _happyCase: RecordedResponse,
  config: ApiTestConfig,
): TestCase[] {
  const cases: TestCase[] = [];
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method);

  if (hasBody) {
    // Empty body with Content-Type: application/json
    cases.push({
      id: nextId('neg'),
      name: `${endpoint.method} ${endpoint.path} — empty body with JSON content-type`,
      category: 'negative',
      description: 'Send empty body but Content-Type: application/json',
      request: {
        method: endpoint.method,
        url,
        headers: { ...clone(headers), 'Content-Type': 'application/json' },
      },
      expect: { status: [400, 422] },
      mutation: 'Empty body with application/json content-type',
    });

    // Body = invalid JSON string
    cases.push({
      id: nextId('neg'),
      name: `${endpoint.method} ${endpoint.path} — invalid JSON body`,
      category: 'negative',
      description: 'Send "not json" as body',
      request: {
        method: endpoint.method,
        url,
        headers: { ...clone(headers), 'Content-Type': 'application/json' },
        body: 'not json' as unknown,
      },
      expect: { status: [400, 422] },
      mutation: 'Body = "not json" (invalid JSON)',
    });

    // Body = null
    cases.push({
      id: nextId('neg'),
      name: `${endpoint.method} ${endpoint.path} — null body`,
      category: 'negative',
      description: 'Send null as body',
      request: {
        method: endpoint.method,
        url,
        headers: { ...clone(headers), 'Content-Type': 'application/json' },
        body: null,
      },
      expect: { status: [400, 422] },
      mutation: 'Body = null',
    });

    // Body = array when object expected
    cases.push({
      id: nextId('neg'),
      name: `${endpoint.method} ${endpoint.path} — array body when object expected`,
      category: 'negative',
      description: 'Send [] when endpoint expects {}',
      request: {
        method: endpoint.method,
        url,
        headers: { ...clone(headers), 'Content-Type': 'application/json' },
        body: [],
      },
      expect: { status: [400, 422] },
      mutation: 'Body = [] (array instead of object)',
    });

    // Body = deeply nested object (100 levels)
    cases.push({
      id: nextId('neg'),
      name: `${endpoint.method} ${endpoint.path} — deeply nested body (100 levels)`,
      category: 'negative',
      description: 'Send object nested 100 levels deep',
      request: {
        method: endpoint.method,
        url,
        headers: { ...clone(headers), 'Content-Type': 'application/json' },
        body: buildDeepObject(100),
      },
      expect: { status: [400, 413, 422] },
      mutation: 'Body = 100-level nested object',
    });

    // Wrong Content-Type: text/plain
    cases.push({
      id: nextId('neg'),
      name: `${endpoint.method} ${endpoint.path} — wrong Content-Type (text/plain)`,
      category: 'negative',
      description: 'Send JSON body with Content-Type: text/plain',
      request: {
        method: endpoint.method,
        url,
        headers: { ...clone(headers), 'Content-Type': 'text/plain' },
        body: endpoint.body,
      },
      expect: { status: [400, 415, 422] },
      mutation: 'Content-Type: text/plain for JSON endpoint',
    });

    // Missing Content-Type header entirely
    const noCtHeaders = clone(headers);
    delete noCtHeaders['Content-Type'];
    delete noCtHeaders['content-type'];
    cases.push({
      id: nextId('neg'),
      name: `${endpoint.method} ${endpoint.path} — missing Content-Type`,
      category: 'negative',
      description: 'Send body without Content-Type header',
      request: {
        method: endpoint.method,
        url,
        headers: noCtHeaders,
        body: endpoint.body,
      },
      expect: { status: [400, 415, 422] },
      mutation: 'No Content-Type header',
    });
  }

  // Duplicate query params: ?id=1&id=2
  if (endpoint.query) {
    const firstParam = Object.entries(endpoint.query)[0];
    if (firstParam) {
      const [key] = firstParam;
      const dupeUrl = `${url}${url.includes('?') ? '&' : '?'}${key}=duplicate_value`;
      cases.push({
        id: nextId('neg'),
        name: `${endpoint.method} ${endpoint.path} — duplicate query param '${key}'`,
        category: 'negative',
        description: `Send duplicate query parameter '${key}'`,
        request: {
          method: endpoint.method,
          url: dupeUrl,
          headers: clone(headers),
          body: endpoint.body,
        },
        expect: { status: [200, 400, 422] },
        mutation: `Duplicate query param: ${key}`,
      });
    }
  }

  // Very long URL (8000+ chars)
  const longQuery = 'x'.repeat(8000);
  const longUrl = `${url}${url.includes('?') ? '&' : '?'}fuzz=${longQuery}`;
  cases.push({
    id: nextId('neg'),
    name: `${endpoint.method} ${endpoint.path} — very long URL (8000+ chars)`,
    category: 'negative',
    description: 'Send URL with 8000+ character query string',
    request: {
      method: endpoint.method,
      url: longUrl,
      headers: clone(headers),
      body: endpoint.body,
    },
    expect: { status: [400, 414, 431] },
    mutation: 'URL length > 8000 chars',
  });

  // Very long header value (16KB)
  const longHeaderHeaders = clone(headers);
  longHeaderHeaders['X-Fuzz-Header'] = 'x'.repeat(16_384);
  cases.push({
    id: nextId('neg'),
    name: `${endpoint.method} ${endpoint.path} — very long header (16KB)`,
    category: 'negative',
    description: 'Send header with 16KB value',
    request: {
      method: endpoint.method,
      url,
      headers: longHeaderHeaders,
      body: endpoint.body,
    },
    expect: { status: [400, 431] },
    mutation: 'Header value = 16KB',
  });

  return cases;
}
