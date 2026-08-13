import type { ApiTestConfig, EndpointConfig, MutationModule, PayloadSchema, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, clone, nextId } from '../utils.js';

export const headersMutations: MutationModule = {
  name: 'headers',
  generate(endpoint: EndpointConfig, _happyCase: RecordedResponse, _schema: PayloadSchema | null, config: ApiTestConfig): TestCase[] {
    const cases: TestCase[] = [];
    const url = buildUrl(config, endpoint);
    const headers = buildHeaders(config, endpoint);
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method) && endpoint.body !== undefined;

    if (hasBody) {
      // Remove Content-Type
      const noCT = clone(headers);
      delete noCT['Content-Type'];
      delete noCT['content-type'];
      cases.push({
        id: nextId('headers'),
        name: `${endpoint.method} ${endpoint.path} — no Content-Type`,
        category: 'headers',
        description: 'Remove Content-Type header from request with body',
        request: { method: endpoint.method, url, headers: noCT, body: endpoint.body },
        expect: { status: [400, 415, 422] },
        mutation: 'Removed Content-Type header',
      });

      // Wrong Content-Type
      const wrongCT = clone(headers);
      wrongCT['Content-Type'] = 'text/plain';
      cases.push({
        id: nextId('headers'),
        name: `${endpoint.method} ${endpoint.path} — wrong Content-Type`,
        category: 'headers',
        description: 'Send text/plain Content-Type for JSON endpoint',
        request: { method: endpoint.method, url, headers: wrongCT, body: endpoint.body },
        expect: { status: [400, 415, 422] },
        mutation: 'Changed Content-Type to text/plain',
      });
    }

    // Remove Accept (should still work)
    const noAccept = clone(headers);
    delete noAccept['Accept'];
    delete noAccept['accept'];
    cases.push({
      id: nextId('headers'),
      name: `${endpoint.method} ${endpoint.path} — no Accept header`,
      category: 'headers',
      description: 'Remove Accept header (should still return 200)',
      request: { method: endpoint.method, url, headers: noAccept, body: endpoint.body },
      expect: { status: [200, 201, 204] },
      mutation: 'Removed Accept header',
    });

    return cases;
  },
};
