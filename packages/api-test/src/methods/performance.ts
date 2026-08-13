import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { apiFetch, buildHeaders, buildUrl, nextId } from '../utils.js';

export interface PerformanceConfig {
  thresholds: {
    p50: number;
    p95: number;
    p99: number;
  };
  iterations?: number;
}

export interface PerformanceStats {
  endpoint: string;
  method: string;
  iterations: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  durations: number[];
}

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  thresholds: { p50: 200, p95: 500, p99: 1000 },
  iterations: 10,
};

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function measureEndpoint(
  endpoint: EndpointConfig,
  config: ApiTestConfig,
  iterations: number,
): Promise<PerformanceStats> {
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const result = await apiFetch(url, endpoint.method, headers, endpoint.body);
    durations.push(result.duration);
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    endpoint: endpoint.path,
    method: endpoint.method,
    iterations,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(sum / sorted.length),
    durations: sorted,
  };
}

export function generatePerformanceTests(
  endpoint: EndpointConfig,
  _happyCase: RecordedResponse,
  config: ApiTestConfig,
  perfConfig: PerformanceConfig = DEFAULT_PERFORMANCE_CONFIG,
): TestCase[] {
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);
  const { thresholds } = perfConfig;

  const cases: TestCase[] = [];

  // p50 test
  cases.push({
    id: nextId('perf'),
    name: `${endpoint.method} ${endpoint.path} — p50 ≤ ${thresholds.p50}ms`,
    category: 'performance',
    description: `Median response time should be under ${thresholds.p50}ms`,
    request: { method: endpoint.method, url, headers },
    expect: { status: [200, 201, 204, 301, 302], maxDuration: thresholds.p50 } as TestCase['expect'],
    mutation: `Performance: p50 threshold ${thresholds.p50}ms`,
  });

  // p95 test
  cases.push({
    id: nextId('perf'),
    name: `${endpoint.method} ${endpoint.path} — p95 ≤ ${thresholds.p95}ms`,
    category: 'performance',
    description: `95th percentile response time should be under ${thresholds.p95}ms`,
    request: { method: endpoint.method, url, headers },
    expect: { status: [200, 201, 204, 301, 302], maxDuration: thresholds.p95 } as TestCase['expect'],
    mutation: `Performance: p95 threshold ${thresholds.p95}ms`,
  });

  // p99 test
  cases.push({
    id: nextId('perf'),
    name: `${endpoint.method} ${endpoint.path} — p99 ≤ ${thresholds.p99}ms`,
    category: 'performance',
    description: `99th percentile response time should be under ${thresholds.p99}ms`,
    request: { method: endpoint.method, url, headers },
    expect: { status: [200, 201, 204, 301, 302], maxDuration: thresholds.p99 } as TestCase['expect'],
    mutation: `Performance: p99 threshold ${thresholds.p99}ms`,
  });

  return cases;
}
