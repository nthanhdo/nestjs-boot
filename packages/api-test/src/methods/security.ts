import type { ApiTestConfig, EndpointConfig, PayloadSchema, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

export interface SecurityPayloads {
  sqlInjection: string[];
  nosqlInjection: string[];
  commandInjection: string[];
  ssti: string[];
  pathTraversal: string[];
  headerInjection: string[];
}

export const DEFAULT_SECURITY_PAYLOADS: SecurityPayloads = {
  sqlInjection: [
    "' OR 1=1--",
    '1; DROP TABLE users',
    "' UNION SELECT NULL,NULL,NULL--",
    "' AND 1=0 UNION SELECT NULL--",
    "1' ORDER BY 1--",
    "'; EXEC xp_cmdshell('dir')--",
  ],
  nosqlInjection: [
    '{"$gt":""}',
    '{"$ne":null}',
    '{"$regex":".*"}',
    '{"$where":"1==1"}',
    '{"$or":[{},{"a":"a"}]}',
  ],
  commandInjection: [
    '; ls',
    '| cat /etc/passwd',
    '`whoami`',
    '$(id)',
    '& ping -c 1 127.0.0.1',
    '\n/bin/sh',
  ],
  ssti: [
    '{{7*7}}',
    '${7*7}',
    '<%= 7*7 %>',
    '#{7*7}',
    '{{constructor.constructor("return this")()}}',
  ],
  pathTraversal: [
    '../../etc/passwd',
    '..%2f..%2fetc%2fpasswd',
    '....//....//etc/passwd',
    '%2e%2e%2f%2e%2e%2f',
    '..\\..\\windows\\system32\\config\\sam',
  ],
  headerInjection: [
    '\r\nX-Injected: true',
    '\nX-Injected: true',
    '%0d%0aX-Injected:%20true',
  ],
};

const STACK_TRACE_INDICATORS = [
  'at Object.',
  'at Module.',
  'at Function.',
  'node_modules/',
  'stack trace',
  'Traceback (most recent',
  'Exception in thread',
  'java.lang.',
  'System.Exception',
  '.py", line',
];

const DATA_LEAK_INDICATORS = [
  'root:x:0:0',
  '/bin/bash',
  '/etc/shadow',
  'uid=',
  'gid=',
  'password',
  'secret_key',
  'private_key',
  'BEGIN RSA',
  'BEGIN PRIVATE',
];

export function generateSecurityTests(
  endpoint: EndpointConfig,
  _happyCase: RecordedResponse,
  schema: PayloadSchema | null,
  config: ApiTestConfig,
  payloads: SecurityPayloads = DEFAULT_SECURITY_PAYLOADS,
): TestCase[] {
  const cases: TestCase[] = [];
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);

  const bodyNotContains = [
    ...STACK_TRACE_INDICATORS,
    ...DATA_LEAK_INDICATORS,
  ];

  // --- Body field injection ---
  if (endpoint.body && typeof endpoint.body === 'object' && schema) {
    const stringFields = schema.fields.filter(f => f.type === 'string' && !f.path.includes('.'));

    for (const field of stringFields) {
      const body = endpoint.body as Record<string, unknown>;

      // SQL injection
      for (const payload of payloads.sqlInjection) {
        const mutated = clone(body);
        mutated[field.name] = payload;
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' SQLi: ${payload.slice(0, 20)}`,
          category: 'security',
          description: `SQL injection on '${field.name}'`,
          request: { method: endpoint.method, url, headers: clone(headers), body: mutated },
          expect: { status: [200, 201, 400, 422, 403], bodyNotContains: [...bodyNotContains, 'syntax error', 'SQL', 'mysql', 'postgresql', 'sqlite', 'ORA-'] },
          mutation: `SQLi: ${payload}`,
        });
      }

      // NoSQL injection
      for (const payload of payloads.nosqlInjection) {
        const mutated = clone(body);
        mutated[field.name] = payload;
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' NoSQLi: ${payload.slice(0, 20)}`,
          category: 'security',
          description: `NoSQL injection on '${field.name}'`,
          request: { method: endpoint.method, url, headers: clone(headers), body: mutated },
          expect: { status: [200, 201, 400, 422, 403], bodyNotContains },
          mutation: `NoSQLi: ${payload}`,
        });
      }

      // Command injection
      for (const payload of payloads.commandInjection) {
        const mutated = clone(body);
        mutated[field.name] = payload;
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' CMDi: ${payload.slice(0, 20)}`,
          category: 'security',
          description: `Command injection on '${field.name}'`,
          request: { method: endpoint.method, url, headers: clone(headers), body: mutated },
          expect: { status: [200, 201, 400, 422, 403], bodyNotContains },
          mutation: `CMDi: ${payload}`,
        });
      }

      // SSTI
      for (const payload of payloads.ssti) {
        const mutated = clone(body);
        mutated[field.name] = payload;
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' SSTI: ${payload.slice(0, 20)}`,
          category: 'security',
          description: `SSTI on '${field.name}' — response must not contain evaluated result`,
          request: { method: endpoint.method, url, headers: clone(headers), body: mutated },
          expect: { status: [200, 201, 400, 422, 403], bodyNotContains: [...bodyNotContains, '49'] },
          mutation: `SSTI: ${payload}`,
        });
      }

      // Path traversal
      for (const payload of payloads.pathTraversal) {
        const mutated = clone(body);
        mutated[field.name] = payload;
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' PathTraversal`,
          category: 'security',
          description: `Path traversal on '${field.name}'`,
          request: { method: endpoint.method, url, headers: clone(headers), body: mutated },
          expect: { status: [200, 201, 400, 422, 403], bodyNotContains },
          mutation: `PathTraversal: ${payload}`,
        });
      }
    }
  }

  // --- Query param injection ---
  if (endpoint.query) {
    for (const [paramName, _paramValue] of Object.entries(endpoint.query)) {
      for (const payload of payloads.sqlInjection.slice(0, 3)) {
        const mutatedQuery = { ...endpoint.query, [paramName]: payload };
        const mutatedEndpoint = { ...endpoint, query: mutatedQuery };
        const mutatedUrl = buildUrl(config, mutatedEndpoint);
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — query '${paramName}' SQLi`,
          category: 'security',
          description: `SQL injection in query param '${paramName}'`,
          request: { method: endpoint.method, url: mutatedUrl, headers: clone(headers), body: endpoint.body },
          expect: { status: [200, 400, 422, 403], bodyNotContains: [...bodyNotContains, 'syntax error', 'SQL'] },
          mutation: `Query SQLi: ${paramName}=${payload}`,
        });
      }

      for (const payload of payloads.commandInjection.slice(0, 2)) {
        const mutatedQuery = { ...endpoint.query, [paramName]: payload };
        const mutatedEndpoint = { ...endpoint, query: mutatedQuery };
        const mutatedUrl = buildUrl(config, mutatedEndpoint);
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — query '${paramName}' CMDi`,
          category: 'security',
          description: `Command injection in query param '${paramName}'`,
          request: { method: endpoint.method, url: mutatedUrl, headers: clone(headers), body: endpoint.body },
          expect: { status: [200, 400, 422, 403], bodyNotContains },
          mutation: `Query CMDi: ${paramName}=${payload}`,
        });
      }
    }
  }

  // --- Path param injection ---
  if (endpoint.params) {
    for (const [paramName, _paramValue] of Object.entries(endpoint.params)) {
      for (const payload of payloads.pathTraversal.slice(0, 2)) {
        const mutatedParams = { ...endpoint.params, [paramName]: payload };
        const mutatedEndpoint = { ...endpoint, params: mutatedParams };
        const mutatedUrl = buildUrl(config, mutatedEndpoint);
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — path ':${paramName}' traversal`,
          category: 'security',
          description: `Path traversal in path param ':${paramName}'`,
          request: { method: endpoint.method, url: mutatedUrl, headers: clone(headers), body: endpoint.body },
          expect: { status: [200, 400, 404, 403], bodyNotContains },
          mutation: `Path param traversal: :${paramName}=${payload}`,
        });
      }

      for (const payload of payloads.sqlInjection.slice(0, 2)) {
        const mutatedParams = { ...endpoint.params, [paramName]: payload };
        const mutatedEndpoint = { ...endpoint, params: mutatedParams };
        const mutatedUrl = buildUrl(config, mutatedEndpoint);
        cases.push({
          id: nextId('sec'),
          name: `${endpoint.method} ${endpoint.path} — path ':${paramName}' SQLi`,
          category: 'security',
          description: `SQL injection in path param ':${paramName}'`,
          request: { method: endpoint.method, url: mutatedUrl, headers: clone(headers), body: endpoint.body },
          expect: { status: [200, 400, 404, 403], bodyNotContains: [...bodyNotContains, 'syntax error', 'SQL'] },
          mutation: `Path param SQLi: :${paramName}=${payload}`,
        });
      }
    }
  }

  // --- Header injection ---
  for (const payload of payloads.headerInjection) {
    const injectedHeaders = clone(headers);
    injectedHeaders['X-Custom-Test'] = payload;
    cases.push({
      id: nextId('sec'),
      name: `${endpoint.method} ${endpoint.path} — header injection`,
      category: 'security',
      description: 'CRLF/header injection via custom header value',
      request: { method: endpoint.method, url, headers: injectedHeaders, body: endpoint.body },
      expect: { status: [200, 400, 403, 422], bodyNotContains },
      mutation: `Header injection: ${payload.slice(0, 20)}`,
    });
  }

  return cases;
}
