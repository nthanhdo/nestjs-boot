import type { ApiTestConfig, EndpointConfig, HttpMethod, MutationModule, PayloadSchema, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export const methodMutations: MutationModule = {
  name: 'method',
  generate(endpoint: EndpointConfig, _happyCase: RecordedResponse, _schema: PayloadSchema | null, config: ApiTestConfig): TestCase[] {
    const cases: TestCase[] = [];
    const url = buildUrl(config, endpoint);
    const headers = buildHeaders(config, endpoint);
    const wrongMethods = ALL_METHODS.filter(m => m !== endpoint.method);

    for (const method of wrongMethods) {
      cases.push({
        id: nextId('method'),
        name: `${method} ${endpoint.path} — wrong method (expected ${endpoint.method})`,
        category: 'method',
        description: `Send ${method} instead of ${endpoint.method}`,
        request: {
          method,
          url,
          headers: clone(headers),
          body: ['POST', 'PUT', 'PATCH'].includes(method) ? endpoint.body : undefined,
        },
        expect: { status: [405, 404, 400, 301] },
        mutation: `Changed method from ${endpoint.method} to ${method}`,
      });
    }

    return cases;
  },
};
