import type { ApiTestConfig, EndpointConfig, MutationModule, PayloadSchema, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

export const edgeMutations: MutationModule = {
  name: 'edge',
  generate(endpoint: EndpointConfig, _happyCase: RecordedResponse, schema: PayloadSchema | null, config: ApiTestConfig): TestCase[] {
    if (!endpoint.body || typeof endpoint.body !== 'object' || !schema) return [];

    const cases: TestCase[] = [];
    const url = buildUrl(config, endpoint);
    const headers = buildHeaders(config, endpoint);
    const body = endpoint.body as Record<string, unknown>;
    const topFields = schema.fields.filter(f => !f.path.includes('.'));

    for (const field of topFields) {
      if (field.type === 'string') {
        // Empty string
        const empty = clone(body);
        empty[field.name] = '';
        cases.push({
          id: nextId('edge'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' empty string`,
          category: 'edge',
          description: `Set '${field.name}' to empty string`,
          request: { method: endpoint.method, url, headers: clone(headers), body: empty },
          expect: { status: [400, 422, 200, 201] },
          mutation: `Set '${field.name}' to ""`,
        });

        // Very long string
        const longStr = clone(body);
        longStr[field.name] = 'x'.repeat(10_000);
        cases.push({
          id: nextId('edge'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' very long string`,
          category: 'edge',
          description: `Set '${field.name}' to 10000-char string`,
          request: { method: endpoint.method, url, headers: clone(headers), body: longStr },
          expect: { status: [400, 413, 422] },
          mutation: `Set '${field.name}' to 10000-char string`,
        });

        // XSS
        const xss = clone(body);
        xss[field.name] = '<script>alert(1)</script>';
        cases.push({
          id: nextId('edge'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' XSS payload`,
          category: 'edge',
          description: `XSS test: set '${field.name}' to script tag`,
          request: { method: endpoint.method, url, headers: clone(headers), body: xss },
          expect: { status: [200, 201, 400, 422], bodyNotContains: ['<script>alert(1)</script>'] },
          mutation: `Set '${field.name}' to XSS payload`,
        });

        // SQL injection
        const sqli = clone(body);
        sqli[field.name] = "' OR 1=1 --";
        cases.push({
          id: nextId('edge'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' SQL injection`,
          category: 'edge',
          description: `SQL injection test for '${field.name}'`,
          request: { method: endpoint.method, url, headers: clone(headers), body: sqli },
          expect: { status: [200, 201, 400, 422], bodyNotContains: ['syntax error', 'SQL', 'mysql', 'postgresql'] },
          mutation: `Set '${field.name}' to SQL injection string`,
        });

        // Unicode null
        const nullChar = clone(body);
        nullChar[field.name] = '\u0000';
        cases.push({
          id: nextId('edge'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' null char`,
          category: 'edge',
          description: `Set '${field.name}' to unicode null character`,
          request: { method: endpoint.method, url, headers: clone(headers), body: nullChar },
          expect: { status: [200, 201, 400, 422] },
          mutation: `Set '${field.name}' to \\u0000`,
        });
      }

      if (field.type === 'number') {
        const mutations: [string, number][] = [
          ['zero', 0],
          ['negative', -1],
          ['MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER],
          ['float', 1.5],
        ];

        for (const [label, val] of mutations) {
          const mutated = clone(body);
          mutated[field.name] = val;
          cases.push({
            id: nextId('edge'),
            name: `${endpoint.method} ${endpoint.path} — '${field.name}' ${label}`,
            category: 'edge',
            description: `Set '${field.name}' to ${label} (${val})`,
            request: { method: endpoint.method, url, headers: clone(headers), body: mutated },
            expect: { status: [200, 201, 400, 422] },
            mutation: `Set '${field.name}' to ${val}`,
          });
        }
      }
    }

    return cases;
  },
};
