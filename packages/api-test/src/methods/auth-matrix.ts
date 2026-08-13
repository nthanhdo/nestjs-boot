import type { ApiTestConfig, TestCase } from '../types.js';
import { buildUrl, nextId } from '../utils.js';

export interface AuthMatrixRole {
  name: string;
  token: string;
  tokenType?: 'bearer' | 'api-key';
  headerName?: string;
}

export interface AuthMatrixEntry {
  endpoint: string;  // "GET /users"
  allowedRoles: string[];
}

export interface AuthMatrixConfig {
  roles: AuthMatrixRole[];
  matrix: AuthMatrixEntry[];
}

/**
 * Parse "METHOD /path" into components.
 */
function parseEndpointString(ep: string): { method: string; path: string } {
  const parts = ep.trim().split(/\s+/);
  return {
    method: (parts[0] || 'GET').toUpperCase(),
    path: parts.slice(1).join(' ') || '/',
  };
}

/**
 * Build auth header for a role.
 */
function buildRoleHeaders(role: AuthMatrixRole): Record<string, string> {
  const tokenType = role.tokenType ?? 'bearer';
  if (tokenType === 'api-key') {
    return { [role.headerName ?? 'X-API-Key']: role.token };
  }
  return { Authorization: `Bearer ${role.token}` };
}

/**
 * Generate RBAC test cases for every endpoint × role combination.
 *
 * - Allowed role → expect 200/201/204
 * - Denied role → expect 403
 * - No auth → expect 401
 */
export function generateAuthMatrix(
  config: ApiTestConfig,
  matrixConfig: AuthMatrixConfig,
): TestCase[] {
  const cases: TestCase[] = [];

  for (const entry of matrixConfig.matrix) {
    const { method, path } = parseEndpointString(entry.endpoint);
    const url = buildUrl(config, { method: method as any, path });

    // Test: no auth → 401
    cases.push({
      id: nextId('auth-matrix'),
      name: `RBAC ${entry.endpoint} — no auth → 401`,
      category: 'auth-matrix',
      description: `${entry.endpoint} without authentication should return 401`,
      request: {
        method,
        url,
        headers: { 'Content-Type': 'application/json' },
      },
      expect: { status: 401 },
      mutation: 'Request without any authentication token',
    });

    // Test each role
    for (const role of matrixConfig.roles) {
      const isAllowed = entry.allowedRoles.includes(role.name);
      const roleHeaders = buildRoleHeaders(role);

      cases.push({
        id: nextId('auth-matrix'),
        name: `RBAC ${entry.endpoint} — ${role.name} → ${isAllowed ? 'allowed' : '403'}`,
        category: 'auth-matrix',
        description: `${entry.endpoint} with role "${role.name}" should ${isAllowed ? 'succeed' : 'be forbidden'}`,
        request: {
          method,
          url,
          headers: { 'Content-Type': 'application/json', ...roleHeaders },
        },
        expect: { status: isAllowed ? [200, 201, 204] : 403 },
        mutation: `Authenticate as "${role.name}" (${isAllowed ? 'allowed' : 'denied'})`,
      });
    }
  }

  return cases;
}
