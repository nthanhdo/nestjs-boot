import { readFileSync } from 'node:fs';
import type { ApiTestConfig, EndpointConfig, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export interface SpecDriftConfig {
  specPath: string;
}

interface OpenApiSpec {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

interface OpenApiOperation {
  parameters?: OpenApiParameter[];
  requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
  responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }>; description?: string }>;
}

interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: OpenApiSchema;
}

interface OpenApiSchema {
  type?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  $ref?: string;
  allOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  enum?: unknown[];
  format?: string;
}

function loadSpec(specPath: string): OpenApiSpec {
  const raw = readFileSync(specPath, 'utf-8');
  if (specPath.endsWith('.yaml') || specPath.endsWith('.yml')) {
    // Basic YAML parsing — only JSON specs fully supported without yaml dep
    try {
      const yamlMod = require('js-yaml');
      return yamlMod.load(raw) as OpenApiSpec;
    } catch {
      throw new Error('YAML spec requires "js-yaml" package. Use JSON format or install js-yaml.');
    }
  }
  return JSON.parse(raw);
}

function resolveRef(spec: OpenApiSpec, schema: OpenApiSchema): OpenApiSchema {
  if (!schema.$ref) return schema;
  const refPath = schema.$ref.replace('#/', '').split('/');
  let current: unknown = spec;
  for (const part of refPath) {
    current = (current as Record<string, unknown>)?.[part];
  }
  return (current as OpenApiSchema) || schema;
}

function flattenProperties(
  spec: OpenApiSpec,
  schema: OpenApiSchema,
): Record<string, { type: string; required: boolean }> {
  const resolved = resolveRef(spec, schema);
  const result: Record<string, { type: string; required: boolean }> = {};
  const requiredSet = new Set(resolved.required || []);

  if (resolved.properties) {
    for (const [key, propSchema] of Object.entries(resolved.properties)) {
      const prop = resolveRef(spec, propSchema);
      result[key] = {
        type: prop.type || 'unknown',
        required: requiredSet.has(key),
      };
    }
  }

  // Handle allOf
  if (resolved.allOf) {
    for (const sub of resolved.allOf) {
      const subProps = flattenProperties(spec, sub);
      Object.assign(result, subProps);
    }
  }

  return result;
}

function httpMethodFromSpec(method: string): string {
  return method.toUpperCase();
}

export function generateSpecDriftTests(
  config: ApiTestConfig,
  driftConfig: SpecDriftConfig,
): TestCase[] {
  const spec = loadSpec(driftConfig.specPath);
  const cases: TestCase[] = [];

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (['parameters', 'summary', 'description', 'servers'].includes(method)) continue;

      const httpMethod = httpMethodFromSpec(method);
      const endpoint: EndpointConfig = {
        method: httpMethod as EndpointConfig['method'],
        path,
      };
      const url = buildUrl(config, endpoint);
      const headers = buildHeaders(config, endpoint);

      // Test: endpoint exists and returns documented status codes
      const expectedStatuses = Object.keys(operation.responses || {})
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n));

      if (expectedStatuses.length > 0) {
        cases.push({
          id: nextId('drift'),
          name: `${httpMethod} ${path} — status code matches spec`,
          category: 'spec-drift',
          description: `Response status should be one of: ${expectedStatuses.join(', ')}`,
          request: { method: httpMethod, url, headers },
          expect: { status: expectedStatuses },
          mutation: 'Spec drift: status code validation',
        });
      }

      // Test: response body schema matches spec (for success responses)
      const successCode = expectedStatuses.find(s => s >= 200 && s < 300) || 200;
      const successResponse = operation.responses?.[String(successCode)] || operation.responses?.['200'];
      if (successResponse?.content?.['application/json']?.schema) {
        const responseSchema = successResponse.content['application/json'].schema;
        const expectedFields = flattenProperties(spec, responseSchema);
        const fieldNames = Object.keys(expectedFields);

        if (fieldNames.length > 0) {
          cases.push({
            id: nextId('drift'),
            name: `${httpMethod} ${path} — response schema matches spec`,
            category: 'spec-drift',
            description: `Response body should contain spec-defined fields: ${fieldNames.slice(0, 5).join(', ')}${fieldNames.length > 5 ? '...' : ''}`,
            request: { method: httpMethod, url, headers },
            expect: {
              status: [successCode],
              matchesSpec: {
                fields: expectedFields,
                specPath: driftConfig.specPath,
              },
            } as TestCase['expect'],
            mutation: 'Spec drift: response schema validation',
          });
        }
      }

      // Test: required parameters present in spec
      const specParams = operation.parameters || [];
      const requiredParams = specParams.filter(p => p.required);
      if (requiredParams.length > 0) {
        cases.push({
          id: nextId('drift'),
          name: `${httpMethod} ${path} — required params documented`,
          category: 'spec-drift',
          description: `Spec requires params: ${requiredParams.map(p => `${p.in}:${p.name}`).join(', ')}`,
          request: { method: httpMethod, url, headers },
          expect: { status: [successCode, 400, 422] },
          mutation: `Spec drift: required params check (${requiredParams.length} params)`,
        });
      }
    }
  }

  return cases;
}
