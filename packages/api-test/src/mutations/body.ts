import type { ApiTestConfig, EndpointConfig, MutationModule, PayloadSchema, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

export const bodyMutations: MutationModule = {
  name: 'body',
  generate(endpoint: EndpointConfig, _happyCase: RecordedResponse, schema: PayloadSchema | null, config: ApiTestConfig): TestCase[] {
    if (!endpoint.body || typeof endpoint.body !== 'object') return [];
    if (!schema || schema.fields.length === 0) return [];

    const cases: TestCase[] = [];
    const url = buildUrl(config, endpoint);
    const headers = buildHeaders(config, endpoint);
    const body = endpoint.body as Record<string, unknown>;

    // Top-level fields only
    const topFields = schema.fields.filter(f => !f.path.includes('.'));

    // Per-field mutations
    for (const field of topFields) {
      // Remove field
      const withoutField = clone(body);
      delete withoutField[field.name];
      cases.push({
        id: nextId('body'),
        name: `${endpoint.method} ${endpoint.path} — missing '${field.name}'`,
        category: 'body',
        description: `Remove required field '${field.name}'`,
        request: { method: endpoint.method, url, headers: clone(headers), body: withoutField },
        expect: { status: [400, 422] },
        mutation: `Removed field '${field.name}'`,
      });

      // Wrong type: string → number
      if (field.type === 'string') {
        const wrongType = clone(body);
        wrongType[field.name] = 12345;
        cases.push({
          id: nextId('body'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' wrong type (number)`,
          category: 'body',
          description: `Send number instead of string for '${field.name}'`,
          request: { method: endpoint.method, url, headers: clone(headers), body: wrongType },
          expect: { status: [400, 422] },
          mutation: `Changed '${field.name}' from string to number`,
        });
      }

      // Wrong type: number → string
      if (field.type === 'number') {
        const wrongType = clone(body);
        wrongType[field.name] = 'not-a-number';
        cases.push({
          id: nextId('body'),
          name: `${endpoint.method} ${endpoint.path} — '${field.name}' wrong type (string)`,
          category: 'body',
          description: `Send string instead of number for '${field.name}'`,
          request: { method: endpoint.method, url, headers: clone(headers), body: wrongType },
          expect: { status: [400, 422] },
          mutation: `Changed '${field.name}' from number to string`,
        });
      }

      // Null value
      const nullVal = clone(body);
      nullVal[field.name] = null;
      cases.push({
        id: nextId('body'),
        name: `${endpoint.method} ${endpoint.path} — '${field.name}' is null`,
        category: 'body',
        description: `Set '${field.name}' to null`,
        request: { method: endpoint.method, url, headers: clone(headers), body: nullVal },
        expect: { status: [400, 422] },
        mutation: `Set '${field.name}' to null`,
      });
    }

    // Empty object
    cases.push({
      id: nextId('body'),
      name: `${endpoint.method} ${endpoint.path} — empty body {}`,
      category: 'body',
      description: 'Send empty object as body',
      request: { method: endpoint.method, url, headers: clone(headers), body: {} },
      expect: { status: [400, 422] },
      mutation: 'Replaced body with empty object {}',
    });

    // No body at all
    const noCTHeaders = clone(headers);
    delete noCTHeaders['Content-Type'];
    cases.push({
      id: nextId('body'),
      name: `${endpoint.method} ${endpoint.path} — no body`,
      category: 'body',
      description: 'Send request without body or content-type',
      request: { method: endpoint.method, url, headers: noCTHeaders },
      expect: { status: [400, 422] },
      mutation: 'Removed body and content-type header',
    });

    // Array instead of object
    cases.push({
      id: nextId('body'),
      name: `${endpoint.method} ${endpoint.path} — array body`,
      category: 'body',
      description: 'Send array instead of object body',
      request: { method: endpoint.method, url, headers: clone(headers), body: [body] },
      expect: { status: [400, 422] },
      mutation: 'Replaced body with array wrapping the object',
    });

    // Extra unknown field
    const extraField = clone(body);
    extraField['__unknown_field_xyz'] = 'test';
    cases.push({
      id: nextId('body'),
      name: `${endpoint.method} ${endpoint.path} — extra unknown field`,
      category: 'body',
      description: 'Send body with extra unknown field',
      request: { method: endpoint.method, url, headers: clone(headers), body: extraField },
      expect: { status: [200, 201, 400, 422] },
      mutation: 'Added unknown field "__unknown_field_xyz"',
    });

    return cases;
  },
};
