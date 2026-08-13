import { readFileSync } from 'node:fs';
import type { ApiTestConfig, EndpointConfig, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export interface ParameterizedConfig {
  endpoint: EndpointConfig;
  dataSource: 'inline' | 'csv' | 'json';
  data: any[];
  filePath?: string;
  expectPerRow?: { status: number };
}

export interface ParameterizedTestCase extends TestCase {
  rowIndex: number;
  rowData: Record<string, unknown>;
}

/**
 * Parse CSV content into an array of objects using the header row as keys.
 */
function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

/**
 * Load data rows from the configured source.
 */
function loadData(config: ParameterizedConfig): any[] {
  if (config.dataSource === 'inline') return config.data;

  const filePath = config.filePath ?? '';
  const content = readFileSync(filePath, 'utf-8');

  if (config.dataSource === 'csv') return parseCsv(content);
  if (config.dataSource === 'json') return JSON.parse(content);
  return config.data;
}

/**
 * Substitute `{{key}}` placeholders in a string with row values.
 */
function substitute(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = row[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

function substituteDeep(obj: unknown, row: Record<string, unknown>): unknown {
  if (typeof obj === 'string') return substitute(obj, row);
  if (Array.isArray(obj)) return obj.map(item => substituteDeep(item, row));
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = substituteDeep(v, row);
    }
    return result;
  }
  return obj;
}

/**
 * Generate one test case per data row with substituted values.
 */
export function generateParameterized(
  config: ApiTestConfig,
  paramConfig: ParameterizedConfig,
): ParameterizedTestCase[] {
  const rows = loadData(paramConfig);
  const endpoint = paramConfig.endpoint;
  const baseUrl = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);

  return rows.map((row, i) => {
    const rowObj = typeof row === 'object' && row !== null ? row : { value: row };
    const url = substitute(baseUrl, rowObj);
    const body = endpoint.body ? substituteDeep(endpoint.body, rowObj) : undefined;
    const rowExpect = (rowObj as any)._expect;
    const status = rowExpect?.status ?? paramConfig.expectPerRow?.status ?? 200;

    const label = JSON.stringify(row).slice(0, 60);

    const tc: ParameterizedTestCase = {
      id: nextId('param'),
      name: `Parameterized ${endpoint.method} ${endpoint.path} — row ${i + 1}: ${label}`,
      category: 'parameterized',
      description: `Data-driven test with row ${i + 1}`,
      request: {
        method: endpoint.method,
        url,
        headers: { ...headers },
        body,
      },
      expect: { status },
      mutation: `Parameterized row ${i + 1}: ${label}`,
      rowIndex: i,
      rowData: rowObj,
    };

    return tc;
  });
}
