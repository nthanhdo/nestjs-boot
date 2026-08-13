import type { ApiTestConfig, EndpointConfig, RecordedResponse, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export interface RateLimitConfig {
  endpoint: EndpointConfig;
  burstCount?: number;
  detectFromHeaders?: boolean;
}

export interface RateLimitTestCase extends TestCase {
  burstCount: number;
  sequential: boolean;
}

const RATE_LIMIT_HEADERS = [
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'ratelimit-limit',
  'ratelimit-remaining',
  'retry-after',
  'x-rate-limit-limit',
  'x-rate-limit-remaining',
];

/**
 * Detect rate limit value from response headers.
 */
export function detectRateLimit(headers: Record<string, string>): number | null {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }

  for (const key of ['x-ratelimit-limit', 'ratelimit-limit', 'x-rate-limit-limit']) {
    if (lower[key]) {
      const val = parseInt(lower[key], 10);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return null;
}

/**
 * Generate rate limit verification test cases.
 *
 * If a happy-case response is provided with rate-limit headers, uses the detected
 * limit + 1 as burst count. Otherwise uses the configured burstCount (default 50).
 */
export function generateRateLimitTests(
  config: ApiTestConfig,
  rateLimitConfig: RateLimitConfig,
  happyCase?: RecordedResponse,
): RateLimitTestCase[] {
  const { endpoint } = rateLimitConfig;
  const url = buildUrl(config, endpoint);
  const headers = buildHeaders(config, endpoint);
  const cases: RateLimitTestCase[] = [];

  let detectedLimit: number | null = null;
  if (happyCase && rateLimitConfig.detectFromHeaders !== false) {
    detectedLimit = detectRateLimit(happyCase.headers);
  }

  const burstCount = detectedLimit
    ? detectedLimit + 1
    : (rateLimitConfig.burstCount ?? 50);

  // Test 1: Burst requests — last one should get 429
  cases.push({
    id: nextId('ratelimit'),
    name: `Rate limit ${endpoint.method} ${endpoint.path} — burst ${burstCount} requests`,
    category: 'rate-limit',
    description: `Send ${burstCount} rapid requests; expect 429 on overflow`,
    request: { method: endpoint.method, url, headers },
    expect: { status: 429 },
    mutation: `Burst ${burstCount} requests to trigger rate limit`,
    burstCount,
    sequential: true,
  });

  // Test 2: Verify Retry-After header on 429
  cases.push({
    id: nextId('ratelimit'),
    name: `Rate limit ${endpoint.method} ${endpoint.path} — Retry-After present`,
    category: 'rate-limit',
    description: 'After 429, response should include Retry-After header',
    request: { method: endpoint.method, url, headers },
    expect: {
      status: 429,
      headerPresent: ['retry-after'],
    },
    mutation: 'Verify Retry-After header on rate-limited response',
    burstCount,
    sequential: true,
  });

  // Test 3: Verify rate limit headers decrement
  if (detectedLimit) {
    cases.push({
      id: nextId('ratelimit'),
      name: `Rate limit ${endpoint.method} ${endpoint.path} — headers decrement`,
      category: 'rate-limit',
      description: 'Rate limit remaining header should decrement with each request',
      request: { method: endpoint.method, url, headers },
      expect: {
        status: [200, 429],
        headerPresent: RATE_LIMIT_HEADERS.filter(h =>
          happyCase?.headers[h] !== undefined ||
          happyCase?.headers[h.toLowerCase()] !== undefined
        ),
      },
      mutation: 'Verify rate limit remaining decrements across requests',
      burstCount: 3,
      sequential: true,
    });
  }

  return cases;
}
