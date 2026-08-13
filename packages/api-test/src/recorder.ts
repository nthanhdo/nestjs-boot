import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiTestConfig, EndpointConfig, RecordedResponse } from './types.js';
import { apiFetch, buildHeaders, buildUrl, ensureDir, getColors, pathSlug } from './utils.js';

export async function recordEndpoint(
  config: ApiTestConfig,
  endpoint: EndpointConfig,
): Promise<RecordedResponse> {
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);

  const result = await apiFetch(url, endpoint.method, headers, endpoint.body);

  return {
    endpoint,
    status: result.status,
    headers: result.headers,
    body: result.body,
    duration: result.duration,
    timestamp: new Date().toISOString(),
  };
}

export async function recordAll(config: ApiTestConfig): Promise<RecordedResponse[]> {
  const c = getColors();
  const results: RecordedResponse[] = [];
  const outputDir = config.outputDir || './api-tests';

  console.log(c.bold('\nRecording happy cases...\n'));

  for (const endpoint of config.endpoints) {
    const label = `${endpoint.method} ${endpoint.path}`;
    try {
      const response = await recordEndpoint(config, endpoint);
      results.push(response);

      const statusColor = response.status < 300 ? c.green : response.status < 400 ? c.yellow : c.red;
      console.log(`  ${statusColor(`${response.status}`)} ${label} ${c.dim(`(${response.duration}ms)`)}`);

      // Save recording
      const filePath = join(outputDir, 'recordings', `${pathSlug(endpoint)}.json`);
      ensureDir(filePath);
      writeFileSync(filePath, JSON.stringify(response, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${c.red('ERR')} ${label} — ${c.red(msg)}`);
      results.push({
        endpoint,
        status: 0,
        headers: {},
        body: null,
        duration: 0,
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log(`\n${c.green('✓')} Recorded ${results.filter(r => r.status > 0).length}/${config.endpoints.length} endpoints\n`);
  return results;
}
