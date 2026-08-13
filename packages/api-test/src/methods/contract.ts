import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export interface ContractSchema {
  type: string;
  properties?: Record<string, ContractSchema>;
  items?: ContractSchema;
  required?: string[];
  nullable?: boolean;
  additionalProperties?: boolean;
}

export interface ContractTestCase extends TestCase {
  expect: TestCase['expect'] & {
    schema?: ContractSchema;
  };
}

function inferType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function inferSchema(body: unknown): ContractSchema {
  if (body === null || body === undefined) {
    return { type: 'null', nullable: true };
  }

  if (Array.isArray(body)) {
    const itemSchema = body.length > 0 ? inferSchema(body[0]) : { type: 'object' };
    return { type: 'array', items: itemSchema };
  }

  if (typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const properties: Record<string, ContractSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      properties[key] = inferSchema(value);
      if (value !== null && value !== undefined) {
        required.push(key);
      } else {
        properties[key].nullable = true;
      }
    }

    return { type: 'object', properties, required, additionalProperties: false };
  }

  return { type: inferType(body) };
}

export function generateContractTests(
  endpoint: EndpointConfig,
  happyCase: RecordedResponse,
  config: ApiTestConfig,
  openApiSchema?: ContractSchema,
): ContractTestCase[] {
  const cases: ContractTestCase[] = [];
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);
  const schema = openApiSchema || inferSchema(happyCase.body);

  // 1. Full schema validation
  cases.push({
    id: nextId('contract'),
    name: `${endpoint.method} ${endpoint.path} — schema match`,
    category: 'contract',
    description: 'Response body matches expected schema (types, required fields)',
    request: { method: endpoint.method, url, headers, body: endpoint.body },
    expect: { status: happyCase.status, schema },
    mutation: 'Replay happy case and validate response schema',
  });

  // 2. Per-field presence checks (for object responses)
  if (schema.type === 'object' && schema.required) {
    for (const field of schema.required) {
      cases.push({
        id: nextId('contract'),
        name: `${endpoint.method} ${endpoint.path} — field "${field}" present`,
        category: 'contract',
        description: `Required field "${field}" must be present in response`,
        request: { method: endpoint.method, url, headers, body: endpoint.body },
        expect: { status: happyCase.status, bodyContains: [`"${field}"`] },
        mutation: `Assert required field "${field}" exists in response body`,
      });
    }
  }

  // 3. Type checks per field
  if (schema.type === 'object' && schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      cases.push({
        id: nextId('contract'),
        name: `${endpoint.method} ${endpoint.path} — field "${field}" type=${fieldSchema.type}`,
        category: 'contract',
        description: `Field "${field}" must be of type "${fieldSchema.type}"`,
        request: { method: endpoint.method, url, headers, body: endpoint.body },
        expect: { status: happyCase.status, schema: { type: 'object', properties: { [field]: fieldSchema } } },
        mutation: `Assert field "${field}" has correct type "${fieldSchema.type}"`,
      });
    }
  }

  // 4. No extra fields (strict mode)
  if (schema.type === 'object' && schema.additionalProperties === false) {
    cases.push({
      id: nextId('contract'),
      name: `${endpoint.method} ${endpoint.path} — no extra fields`,
      category: 'contract',
      description: 'Response should not contain unexpected fields',
      request: { method: endpoint.method, url, headers, body: endpoint.body },
      expect: { status: happyCase.status, schema: { ...schema, additionalProperties: false } },
      mutation: 'Assert response has no additional properties beyond schema',
    });
  }

  return cases;
}
