import type { ApiTestConfig, EndpointConfig, TestCase, TestResult } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export interface FuzzConfig {
  endpoint: EndpointConfig;
  fields: FuzzField[];
  iterations?: number;
  seed?: number;
}

export interface FuzzField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  location: 'body' | 'query' | 'header';
}

export type FuzzSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface FuzzResult {
  testCase: TestCase;
  severity: FuzzSeverity;
  status: number;
  detail: string;
}

// ── Seedable xorshift32 PRNG (zero deps) ──

class Xorshift {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0 || 1;
  }

  next(): number {
    let s = this.state;
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    this.state = s;
    return (s >>> 0) / 0xFFFFFFFF;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }

  randomString(len: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < len; i++) result += chars[this.nextInt(0, chars.length - 1)];
    return result;
  }
}

// ── Fuzz value generators ──

const STRING_FUZZ = [
  '', ' ', '\t', '\n', '\r\n',
  '\0', '\0\0\0',
  '%s%s%s%x%x%x%n%n%n',
  '{{template}}', '${injection}',
  '<script>alert(1)</script>',
  "' OR 1=1 --",
  '"; DROP TABLE users; --',
  '../../../etc/passwd',
  'A'.repeat(10_000),
  '\uD800', // lone surrogate
  '\uFFFE', // non-character
  'null', 'undefined', 'NaN', 'true', 'false',
  '{"__proto__":{"polluted":true}}',
];

const NUMBER_FUZZ = [
  0, -0, 1, -1, 0.1, -0.1,
  Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
  Number.MAX_VALUE, Number.MIN_VALUE,
  Infinity, -Infinity, NaN,
  1e308, -1e308, 1e-308,
  999999999999999999999,
  0xDEADBEEF,
];

function generateFuzzValue(field: FuzzField, rng: Xorshift): unknown {
  switch (field.type) {
    case 'string': {
      if (rng.next() < 0.5) return rng.pick(STRING_FUZZ);
      return rng.randomString(rng.nextInt(1, 5000));
    }
    case 'number': {
      if (rng.next() < 0.5) return rng.pick(NUMBER_FUZZ);
      return rng.next() < 0.5
        ? rng.nextInt(-1_000_000, 1_000_000)
        : rng.next() * 1e15 - 5e14;
    }
    case 'boolean':
      return rng.pick([true, false, 0, 1, 'true', 'false', null, '']);
    case 'object': {
      const depth = rng.nextInt(1, 5);
      let obj: any = { fuzz: true };
      let current = obj;
      for (let i = 0; i < depth; i++) {
        current.nested = { level: i, random: rng.randomString(10) };
        current = current.nested;
      }
      if (rng.next() < 0.3) obj.__proto__ = { polluted: true };
      if (rng.next() < 0.3) obj.constructor = { prototype: { isAdmin: true } };
      return obj;
    }
    case 'array': {
      const len = rng.nextInt(0, 100);
      const arr: unknown[] = [];
      for (let i = 0; i < len; i++) {
        const types = ['string', 'number', 'boolean', 'object'] as const;
        const t = rng.pick([...types]);
        switch (t) {
          case 'string': arr.push(rng.randomString(rng.nextInt(1, 50))); break;
          case 'number': arr.push(rng.nextInt(-1000, 1000)); break;
          case 'boolean': arr.push(rng.next() > 0.5); break;
          case 'object': arr.push({ k: rng.randomString(5) }); break;
        }
      }
      return arr;
    }
    default:
      return rng.randomString(20);
  }
}

/**
 * Generate fuzz test cases for an endpoint.
 */
export function generateFuzzTests(
  fuzzConfig: FuzzConfig,
  apiConfig: ApiTestConfig,
): TestCase[] {
  const { endpoint, fields, iterations = 100, seed = 42 } = fuzzConfig;
  const rng = new Xorshift(seed);
  const tests: TestCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const field = rng.pick(fields);
    const value = generateFuzzValue(field, rng);

    const body: Record<string, any> = endpoint.body && typeof endpoint.body === 'object'
      ? { ...(endpoint.body as any) }
      : {};
    const query: Record<string, string> = endpoint.query ? { ...endpoint.query } : {};
    const extraHeaders: Record<string, string> = {};

    switch (field.location) {
      case 'body':
        body[field.name] = value;
        break;
      case 'query':
        query[field.name] = String(value);
        break;
      case 'header':
        extraHeaders[field.name] = String(value);
        break;
    }

    const modifiedEp: EndpointConfig = { ...endpoint, query: Object.keys(query).length > 0 ? query : undefined };
    const url = buildUrl(apiConfig, modifiedEp);
    const headers = { ...buildHeaders(apiConfig, modifiedEp), ...extraHeaders };

    tests.push({
      id: nextId('fuzz'),
      name: `Fuzz #${i + 1} [seed=${seed}]: ${field.name}=${summarizeValue(value)}`,
      category: 'edge' as TestCase['category'],
      description: `Fuzz iteration ${i + 1}/${iterations}, field=${field.name}, type=${field.type}`,
      request: {
        method: endpoint.method,
        url,
        headers,
        body: Object.keys(body).length > 0 ? body : endpoint.body,
      },
      expect: { status: [200, 201, 400, 422] },
      mutation: `Fuzz ${field.name} with ${field.type} value (seed=${seed}, iter=${i + 1})`,
    });
  }

  return tests;
}

function summarizeValue(v: unknown): string {
  const s = JSON.stringify(v);
  if (s && s.length > 60) return s.slice(0, 57) + '...';
  return s ?? 'undefined';
}

/**
 * Score fuzz results by severity.
 */
export function scoreFuzzResults(results: TestResult[]): FuzzResult[] {
  return results
    .map(r => {
      let severity: FuzzSeverity = 'NONE';
      let detail = '';

      if (r.actual.status >= 500) {
        severity = 'HIGH';
        detail = `Server crash/error (${r.actual.status})`;
      } else if (r.actual.status >= 400) {
        const bodyStr = typeof r.actual.body === 'string' ? r.actual.body : JSON.stringify(r.actual.body);
        const hasStackTrace = bodyStr?.includes('at ') && bodyStr?.includes('.js:');
        if (hasStackTrace) {
          severity = 'MEDIUM';
          detail = `Error response with stack trace leaked (${r.actual.status})`;
        } else {
          severity = 'LOW';
          detail = `Expected error response (${r.actual.status})`;
        }
      } else {
        detail = `Normal response (${r.actual.status})`;
      }

      return { testCase: r.testCase, severity, status: r.actual.status, detail };
    })
    .sort((a, b) => {
      const order: Record<FuzzSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
      return order[a.severity] - order[b.severity];
    });
}
