import type { ApiTestConfig, EndpointConfig, MutationModule, PayloadSchema, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, clone, nextId } from '../utils.js';

export const paramsMutations: MutationModule = {
  name: 'params',
  generate(endpoint: EndpointConfig, _happyCase: RecordedResponse, _schema: PayloadSchema | null, config: ApiTestConfig): TestCase[] {
    if (!endpoint.params || Object.keys(endpoint.params).length === 0) return [];

    const cases: TestCase[] = [];
    const headers = buildHeaders(config, endpoint);

    for (const [paramName, paramValue] of Object.entries(endpoint.params)) {
      const base = config.host.replace(/\/+$/, '');
      const bp = config.basePath ? `/${config.basePath.replace(/^\/+|\/+$/g, '')}` : '';

      const makeUrl = (val: string) => {
        let path = endpoint.path;
        for (const [k, v] of Object.entries(endpoint.params!)) {
          path = path.replace(`:${k}`, k === paramName ? encodeURIComponent(val) : encodeURIComponent(v));
        }
        return `${base}${bp}${path}`;
      };

      const isNumeric = /^\d+$/.test(paramValue);
      const isMongoId = /^[0-9a-f]{24}$/i.test(paramValue);
      const isUuid = /^[0-9a-f]{8}-/.test(paramValue);

      // Invalid format
      if (isNumeric || isMongoId || isUuid) {
        cases.push({
          id: nextId('params'),
          name: `${endpoint.method} ${endpoint.path} — :${paramName} invalid format`,
          category: 'params',
          description: `Send invalid format for param :${paramName}`,
          request: { method: endpoint.method, url: makeUrl('abc-not-valid'), headers: clone(headers), body: endpoint.body },
          expect: { status: [400, 404, 422] },
          mutation: `Changed :${paramName} from '${paramValue}' to 'abc-not-valid'`,
        });
      }

      // Non-existent resource
      if (isNumeric) {
        cases.push({
          id: nextId('params'),
          name: `${endpoint.method} ${endpoint.path} — :${paramName} non-existent`,
          category: 'params',
          description: `Use non-existent ID for :${paramName}`,
          request: { method: endpoint.method, url: makeUrl('999999999'), headers: clone(headers), body: endpoint.body },
          expect: { status: [404] },
          mutation: `Changed :${paramName} to non-existent ID '999999999'`,
        });
      } else if (isMongoId) {
        cases.push({
          id: nextId('params'),
          name: `${endpoint.method} ${endpoint.path} — :${paramName} non-existent mongo ID`,
          category: 'params',
          description: `Use non-existent MongoDB ObjectId for :${paramName}`,
          request: { method: endpoint.method, url: makeUrl('000000000000000000000000'), headers: clone(headers), body: endpoint.body },
          expect: { status: [404] },
          mutation: `Changed :${paramName} to non-existent ObjectId`,
        });
      }

      // Empty string
      cases.push({
        id: nextId('params'),
        name: `${endpoint.method} ${endpoint.path} — :${paramName} empty`,
        category: 'params',
        description: `Send empty string for :${paramName}`,
        request: { method: endpoint.method, url: makeUrl(''), headers: clone(headers), body: endpoint.body },
        expect: { status: [400, 404, 405] },
        mutation: `Set :${paramName} to empty string`,
      });

      // Special chars
      cases.push({
        id: nextId('params'),
        name: `${endpoint.method} ${endpoint.path} — :${paramName} special chars`,
        category: 'params',
        description: `Send special characters for :${paramName}`,
        request: { method: endpoint.method, url: makeUrl('<script>alert(1)</script>'), headers: clone(headers), body: endpoint.body },
        expect: { status: [400, 404, 422] },
        mutation: `Set :${paramName} to '<script>alert(1)</script>'`,
      });
    }

    return cases;
  },
};
