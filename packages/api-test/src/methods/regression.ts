import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, ensureDir, nextId, pathSlug } from '../utils.js';

export interface RegressionBaseline {
  endpoint: EndpointConfig;
  status: number;
  bodyStructure: Record<string, string>;
  keyFields: Record<string, unknown>;
  timestamp: string;
}

export interface RegressionTestCase extends TestCase {
  expect: TestCase['expect'] & {
    baselineMatch?: boolean;
  };
  baselinePath?: string;
}

function extractBodyStructure(body: unknown, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (body === null || body === undefined) return result;

  if (Array.isArray(body)) {
    result[prefix || '$'] = 'array';
    if (body.length > 0) {
      Object.assign(result, extractBodyStructure(body[0], `${prefix || '$'}[0]`));
    }
    return result;
  }

  if (typeof body === 'object') {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      result[path] = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, extractBodyStructure(value, path));
      }
    }
    return result;
  }

  result[prefix || '$'] = typeof body;
  return result;
}

function extractKeyFields(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const obj = body as Record<string, unknown>;
  const keys: Record<string, unknown> = {};

  // Extract top-level scalar fields as key fields
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value !== 'object') {
      keys[key] = value;
    }
  }
  return keys;
}

export function saveBaseline(
  recording: RecordedResponse,
  outputDir: string,
): RegressionBaseline {
  const baseline: RegressionBaseline = {
    endpoint: recording.endpoint,
    status: recording.status,
    bodyStructure: extractBodyStructure(recording.body),
    keyFields: extractKeyFields(recording.body),
    timestamp: new Date().toISOString(),
  };

  const slug = pathSlug(recording.endpoint);
  const filePath = join(outputDir, 'baselines', `${slug}.baseline.json`);
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(baseline, null, 2));

  return baseline;
}

export function loadBaseline(
  endpoint: EndpointConfig,
  outputDir: string,
): RegressionBaseline | null {
  const slug = pathSlug(endpoint);
  const filePath = join(outputDir, 'baselines', `${slug}.baseline.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function generateRegressionTests(
  recordings: RecordedResponse[],
  config: ApiTestConfig,
  outputDir: string,
): RegressionTestCase[] {
  const cases: RegressionTestCase[] = [];

  for (const recording of recordings) {
    if (recording.status === 0 || recording.status >= 500) continue;

    const { endpoint } = recording;
    const url = buildUrl(config, endpoint);
    const headers = buildHeaders(config, endpoint);
    const slug = pathSlug(endpoint);

    // Save baseline
    saveBaseline(recording, outputDir);
    const baselinePath = join(outputDir, 'baselines', `${slug}.baseline.json`);

    cases.push({
      id: nextId('regression'),
      name: `Regression ${endpoint.method} ${endpoint.path} — baseline match`,
      category: 'regression' as TestCase['category'],
      description: `Compare current response against saved baseline for ${endpoint.method} ${endpoint.path}`,
      request: { method: endpoint.method, url, headers, body: endpoint.body },
      expect: { status: recording.status, baselineMatch: true },
      mutation: 'Replay request and compare response structure/values against baseline',
      baselinePath,
    });
  }

  return cases;
}

export function diffBaseline(
  baseline: RegressionBaseline,
  currentBody: unknown,
  currentStatus: number,
): { passed: boolean; diffs: string[] } {
  const diffs: string[] = [];

  // Status change
  if (currentStatus !== baseline.status) {
    diffs.push(`Status changed: ${baseline.status} → ${currentStatus}`);
  }

  // Structure diff
  const currentStructure = extractBodyStructure(currentBody);
  for (const [path, expectedType] of Object.entries(baseline.bodyStructure)) {
    if (!(path in currentStructure)) {
      diffs.push(`Missing field: ${path} (expected ${expectedType})`);
    } else if (currentStructure[path] !== expectedType) {
      diffs.push(`Type changed: ${path} — ${expectedType} → ${currentStructure[path]}`);
    }
  }

  // New unexpected fields
  for (const path of Object.keys(currentStructure)) {
    if (!(path in baseline.bodyStructure)) {
      diffs.push(`New field: ${path} (type: ${currentStructure[path]})`);
    }
  }

  // Key field value drift
  const currentKeys = extractKeyFields(currentBody);
  for (const [key, expectedValue] of Object.entries(baseline.keyFields)) {
    if (key in currentKeys && currentKeys[key] !== expectedValue) {
      diffs.push(`Value drift: ${key} — ${JSON.stringify(expectedValue)} → ${JSON.stringify(currentKeys[key])}`);
    }
  }

  return { passed: diffs.length === 0, diffs };
}
