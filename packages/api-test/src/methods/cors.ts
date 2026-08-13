import type { ApiTestConfig, EndpointConfig, TestCase } from '../types.js';
import { buildUrl, nextId } from '../utils.js';

export interface CorsConfig {
  endpoint: EndpointConfig;
  allowedOrigins?: string[];
  disallowedOrigins?: string[];
}

/**
 * Generate CORS policy validation test cases.
 *
 * Sends OPTIONS preflight requests with various origins and checks
 * Access-Control-Allow-* headers. Also checks security headers.
 */
export function generateCorsTests(
  config: ApiTestConfig,
  corsConfig: CorsConfig,
): TestCase[] {
  const { endpoint } = corsConfig;
  const url = buildUrl(config, endpoint);
  const cases: TestCase[] = [];

  const sameOrigin = new URL(config.host).origin;
  const allowedOrigins = corsConfig.allowedOrigins ?? [sameOrigin];
  const disallowedOrigins = corsConfig.disallowedOrigins ?? ['https://evil.example.com', 'http://attacker.test'];

  // 1. Same origin preflight
  cases.push({
    id: nextId('cors'),
    name: `CORS ${endpoint.path} — same origin preflight`,
    category: 'cors',
    description: 'OPTIONS preflight from same origin should succeed',
    request: {
      method: 'OPTIONS',
      url,
      headers: {
        Origin: sameOrigin,
        'Access-Control-Request-Method': endpoint.method,
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    },
    expect: {
      status: [200, 204],
      headerPresent: ['access-control-allow-origin'],
    },
    mutation: 'Preflight from same origin',
  });

  // 2. Allowed origins
  for (const origin of allowedOrigins) {
    cases.push({
      id: nextId('cors'),
      name: `CORS ${endpoint.path} — allowed origin: ${origin}`,
      category: 'cors',
      description: `OPTIONS preflight from allowed origin ${origin}`,
      request: {
        method: 'OPTIONS',
        url,
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': endpoint.method,
          'Access-Control-Request-Headers': 'Content-Type',
        },
      },
      expect: {
        status: [200, 204],
        headerPresent: ['access-control-allow-origin', 'access-control-allow-methods'],
      },
      mutation: `Preflight from allowed origin: ${origin}`,
    });
  }

  // 3. Disallowed origins
  for (const origin of disallowedOrigins) {
    cases.push({
      id: nextId('cors'),
      name: `CORS ${endpoint.path} — disallowed origin: ${origin}`,
      category: 'cors',
      description: `OPTIONS preflight from disallowed origin ${origin} should not reflect CORS headers`,
      request: {
        method: 'OPTIONS',
        url,
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': endpoint.method,
        },
      },
      expect: {
        status: [200, 204, 403],
      },
      mutation: `Preflight from disallowed origin: ${origin}`,
    });
  }

  // 4. Wildcard check — flag if Access-Control-Allow-Origin: *
  cases.push({
    id: nextId('cors'),
    name: `CORS ${endpoint.path} — wildcard origin check`,
    category: 'cors',
    description: 'Check if server returns Access-Control-Allow-Origin: * (security concern)',
    request: {
      method: 'OPTIONS',
      url,
      headers: {
        Origin: 'https://wildcard-check.test',
        'Access-Control-Request-Method': 'GET',
      },
    },
    expect: { status: [200, 204, 403] },
    mutation: 'Check for wildcard * in Access-Control-Allow-Origin',
  });

  // 5. Credentials + wildcard check
  cases.push({
    id: nextId('cors'),
    name: `CORS ${endpoint.path} — credentials with wildcard (should fail)`,
    category: 'cors',
    description: 'Access-Control-Allow-Credentials: true with wildcard origin is invalid per spec',
    request: {
      method: 'OPTIONS',
      url,
      headers: {
        Origin: 'https://credentials-check.test',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization',
      },
    },
    expect: { status: [200, 204, 403] },
    mutation: 'Check credentials mode with wildcard origin (browser blocks this)',
  });

  // 6. Security headers on actual request
  cases.push({
    id: nextId('cors'),
    name: `CORS ${endpoint.path} — security headers present`,
    category: 'cors',
    description: 'Response should include security headers (X-Content-Type-Options, X-Frame-Options, HSTS)',
    request: {
      method: endpoint.method,
      url,
      headers: { Origin: sameOrigin },
    },
    expect: {
      status: [200, 201, 204, 301, 302],
      headerPresent: ['x-content-type-options'],
    },
    mutation: 'Verify security headers on standard request',
  });

  return cases;
}
