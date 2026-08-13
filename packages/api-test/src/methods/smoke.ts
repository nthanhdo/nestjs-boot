import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export function generateSmokeTests(
  recordings: RecordedResponse[],
  config: ApiTestConfig,
): TestCase[] {
  return recordings
    .filter(r => r.status > 0 && r.status < 500)
    .map(recording => {
      const { endpoint } = recording;
      const url = buildUrl(config, endpoint);
      const headers = buildHeaders(config, endpoint);

      return {
        id: nextId('smoke'),
        name: `Smoke ${endpoint.method} ${endpoint.path} — non-5xx`,
        category: 'smoke' as TestCase['category'],
        description: `Replay happy case for ${endpoint.method} ${endpoint.path}, expect non-5xx`,
        request: { method: endpoint.method, url, headers, body: endpoint.body },
        expect: { status: [200, 201, 204, 301, 302, 304, 400, 401, 403, 404] },
        mutation: 'Replay exact recorded request, assert status < 500',
      };
    });
}
