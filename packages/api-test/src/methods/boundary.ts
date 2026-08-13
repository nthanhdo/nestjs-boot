import type { ApiTestConfig, EndpointConfig, FieldMeta, PayloadSchema, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

interface BoundaryMutation {
  label: string;
  value: unknown;
  statuses: number[];
}

function stringBoundaries(_field: FieldMeta): BoundaryMutation[] {
  return [
    { label: 'empty string', value: '', statuses: [200, 201, 400, 422] },
    { label: '1 char', value: 'a', statuses: [200, 201, 400, 422] },
    { label: 'max length (10000)', value: 'x'.repeat(10_000), statuses: [400, 413, 422] },
    { label: 'max+1 (10001)', value: 'x'.repeat(10_001), statuses: [400, 413, 422] },
    { label: 'only whitespace', value: '   \t\n  ', statuses: [200, 201, 400, 422] },
    { label: 'unicode surrogate', value: '\uD800\uDC00', statuses: [200, 201, 400, 422] },
    { label: 'null bytes', value: '\x00\x00\x00', statuses: [200, 201, 400, 422] },
  ];
}

function emailBoundaries(_field: FieldMeta): BoundaryMutation[] {
  return [
    { label: 'valid email', value: 'test@example.com', statuses: [200, 201] },
    { label: 'missing @', value: 'testexample.com', statuses: [400, 422] },
    { label: 'double @', value: 'test@@example.com', statuses: [400, 422] },
    { label: 'very long local', value: 'a'.repeat(256) + '@example.com', statuses: [400, 422] },
    { label: 'unicode domain', value: 'test@exämple.com', statuses: [200, 201, 400, 422] },
    { label: 'no domain', value: 'test@', statuses: [400, 422] },
    { label: 'no local', value: '@example.com', statuses: [400, 422] },
  ];
}

function uuidBoundaries(_field: FieldMeta): BoundaryMutation[] {
  return [
    { label: 'valid uuid', value: '550e8400-e29b-41d4-a716-446655440000', statuses: [200, 201, 404] },
    { label: 'short uuid', value: '550e8400-e29b', statuses: [400, 422] },
    { label: 'non-hex chars', value: 'ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ', statuses: [400, 422] },
    { label: 'empty', value: '', statuses: [400, 422] },
    { label: 'no dashes', value: '550e8400e29b41d4a716446655440000', statuses: [200, 201, 400, 422] },
  ];
}

function dateBoundaries(_field: FieldMeta): BoundaryMutation[] {
  return [
    { label: 'valid ISO', value: '2024-01-15T10:30:00Z', statuses: [200, 201] },
    { label: 'invalid format', value: 'not-a-date', statuses: [400, 422] },
    { label: 'epoch 0', value: '1970-01-01T00:00:00Z', statuses: [200, 201, 400, 422] },
    { label: 'far future', value: '9999-12-31T23:59:59Z', statuses: [200, 201, 400, 422] },
    { label: 'far past', value: '1900-01-01T00:00:00Z', statuses: [200, 201, 400, 422] },
    { label: 'date only', value: '2024-01-15', statuses: [200, 201, 400, 422] },
    { label: 'invalid month', value: '2024-13-01T00:00:00Z', statuses: [400, 422] },
    { label: 'invalid day', value: '2024-02-30T00:00:00Z', statuses: [400, 422] },
  ];
}

function intBoundaries(_field: FieldMeta): BoundaryMutation[] {
  return [
    { label: 'zero', value: 0, statuses: [200, 201, 400, 422] },
    { label: 'negative one', value: -1, statuses: [200, 201, 400, 422] },
    { label: 'one', value: 1, statuses: [200, 201] },
    { label: 'MAX_SAFE_INTEGER', value: Number.MAX_SAFE_INTEGER, statuses: [200, 201, 400, 422] },
    { label: 'MIN_SAFE_INTEGER', value: Number.MIN_SAFE_INTEGER, statuses: [200, 201, 400, 422] },
    { label: 'MAX+1 overflow', value: Number.MAX_SAFE_INTEGER + 1, statuses: [400, 422] },
    { label: 'decimal (invalid int)', value: 1.5, statuses: [400, 422] },
  ];
}

function floatBoundaries(_field: FieldMeta): BoundaryMutation[] {
  return [
    { label: 'zero float', value: 0.0, statuses: [200, 201, 400, 422] },
    { label: 'negative float', value: -0.1, statuses: [200, 201, 400, 422] },
    { label: 'very small', value: 1e-300, statuses: [200, 201, 400, 422] },
    { label: 'very large', value: 1e+300, statuses: [200, 201, 400, 422] },
    { label: 'NaN', value: NaN, statuses: [400, 422] },
    { label: 'Infinity', value: Infinity, statuses: [400, 422] },
    { label: '-Infinity', value: -Infinity, statuses: [400, 422] },
  ];
}

function booleanBoundaries(_field: FieldMeta): BoundaryMutation[] {
  return [
    { label: 'true', value: true, statuses: [200, 201] },
    { label: 'false', value: false, statuses: [200, 201] },
    { label: 'string "true"', value: 'true', statuses: [200, 201, 400, 422] },
    { label: 'number 1', value: 1, statuses: [200, 201, 400, 422] },
    { label: 'number 0', value: 0, statuses: [200, 201, 400, 422] },
    { label: 'null', value: null, statuses: [200, 201, 400, 422] },
  ];
}

function arrayBoundaries(_field: FieldMeta): BoundaryMutation[] {
  return [
    { label: 'empty array', value: [], statuses: [200, 201, 400, 422] },
    { label: '1 item', value: ['item'], statuses: [200, 201] },
    { label: '100 items', value: Array.from({ length: 100 }, (_, i) => `item${i}`), statuses: [200, 201, 400, 422] },
    { label: 'nested arrays', value: [[[['deep']]]], statuses: [200, 201, 400, 422] },
    { label: 'null in array', value: [null, null], statuses: [200, 201, 400, 422] },
  ];
}

function getBoundariesForField(field: FieldMeta): BoundaryMutation[] {
  // Pattern-specific first
  if (field.pattern === 'email') return emailBoundaries(field);
  if (field.pattern === 'uuid') return uuidBoundaries(field);
  if (field.pattern === 'iso-date' || field.pattern === 'date') return dateBoundaries(field);

  // Type-based
  switch (field.type) {
    case 'string': return stringBoundaries(field);
    case 'number': {
      // Determine if int or float from current value
      const val = field.value;
      if (typeof val === 'number' && Number.isInteger(val)) return intBoundaries(field);
      return floatBoundaries(field);
    }
    case 'boolean': return booleanBoundaries(field);
    case 'array': return arrayBoundaries(field);
    default: return [];
  }
}

export function generateBoundaryTests(
  endpoint: EndpointConfig,
  _happyCase: RecordedResponse,
  schema: PayloadSchema | null,
  config: ApiTestConfig,
): TestCase[] {
  if (!endpoint.body || typeof endpoint.body !== 'object' || !schema) return [];

  const cases: TestCase[] = [];
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);
  const body = endpoint.body as Record<string, unknown>;
  const topFields = schema.fields.filter(f => !f.path.includes('.'));

  for (const field of topFields) {
    const boundaries = getBoundariesForField(field);

    for (const boundary of boundaries) {
      const mutated = clone(body);
      mutated[field.name] = boundary.value;
      cases.push({
        id: nextId('bnd'),
        name: `${endpoint.method} ${endpoint.path} — '${field.name}' ${boundary.label}`,
        category: 'boundary',
        description: `Boundary test: '${field.name}' (${field.type}${field.pattern ? '/' + field.pattern : ''}) → ${boundary.label}`,
        request: { method: endpoint.method, url, headers: clone(headers), body: mutated },
        expect: { status: boundary.statuses },
        mutation: `Boundary: ${field.name} = ${boundary.label}`,
      });
    }
  }

  // Also test query params
  if (endpoint.query) {
    for (const [paramName] of Object.entries(endpoint.query)) {
      const stringBounds: BoundaryMutation[] = [
        { label: 'empty', value: '', statuses: [200, 400, 422] },
        { label: 'very long (8000)', value: 'x'.repeat(8000), statuses: [400, 414, 422] },
        { label: 'whitespace only', value: '   ', statuses: [200, 400, 422] },
      ];
      for (const boundary of stringBounds) {
        const mutatedQuery = { ...endpoint.query, [paramName]: String(boundary.value) };
        const mutatedEndpoint = { ...endpoint, query: mutatedQuery };
        const mutatedUrl = buildUrl(config, mutatedEndpoint);
        cases.push({
          id: nextId('bnd'),
          name: `${endpoint.method} ${endpoint.path} — query '${paramName}' ${boundary.label}`,
          category: 'boundary',
          description: `Boundary test: query param '${paramName}' → ${boundary.label}`,
          request: { method: endpoint.method, url: mutatedUrl, headers: clone(headers), body: endpoint.body },
          expect: { status: boundary.statuses },
          mutation: `Boundary: query ${paramName} = ${boundary.label}`,
        });
      }
    }
  }

  return cases;
}
