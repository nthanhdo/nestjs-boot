import type { ApiTestConfig, EndpointConfig, HttpMethod } from './types.js';

// ── Colors (picocolors fallback) ──

interface Colors {
  green(s: string): string;
  red(s: string): string;
  yellow(s: string): string;
  cyan(s: string): string;
  gray(s: string): string;
  bold(s: string): string;
  dim(s: string): string;
}

let _colors: Colors | null = null;

export function getColors(): Colors {
  if (_colors) return _colors;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pc = require('picocolors');
    _colors = pc as Colors;
  } catch {
    const id = (s: string) => s;
    _colors = { green: id, red: id, yellow: id, cyan: id, gray: id, bold: id, dim: id };
  }
  return _colors;
}

// ── URL builder ──

export function buildUrl(config: ApiTestConfig, endpoint: EndpointConfig): string {
  let path = endpoint.path;
  if (endpoint.params) {
    for (const [key, val] of Object.entries(endpoint.params)) {
      path = path.replace(`:${key}`, encodeURIComponent(val));
    }
  }
  const base = config.host.replace(/\/+$/, '');
  const bp = config.basePath ? `/${config.basePath.replace(/^\/+|\/+$/g, '')}` : '';
  let url = `${base}${bp}${path}`;

  if (endpoint.query && Object.keys(endpoint.query).length > 0) {
    const qs = new URLSearchParams(endpoint.query).toString();
    url += `?${qs}`;
  }
  return url;
}

// ── Headers builder ──

export function buildHeaders(config: ApiTestConfig, endpoint: EndpointConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  // Content-Type for body methods
  if (endpoint.body !== undefined && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    headers['Content-Type'] = 'application/json';
  }

  // Global headers
  if (config.headers) Object.assign(headers, config.headers);

  // Auth headers
  if (config.auth) {
    switch (config.auth.type) {
      case 'bearer':
        if (config.auth.token) headers['Authorization'] = `Bearer ${config.auth.token}`;
        break;
      case 'api-key':
        if (config.auth.headerName && config.auth.token) {
          headers[config.auth.headerName] = config.auth.token;
        }
        break;
      case 'basic':
        if (config.auth.username && config.auth.password) {
          headers['Authorization'] = `Basic ${Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64')}`;
        }
        break;
      case 'cookie':
        if (config.auth.cookieName && config.auth.cookieValue) {
          headers['Cookie'] = `${config.auth.cookieName}=${config.auth.cookieValue}`;
        }
        break;
    }
  }

  // Endpoint-specific headers
  if (endpoint.headers) Object.assign(headers, endpoint.headers);

  // Endpoint cookies
  if (endpoint.cookies) {
    const existing = headers['Cookie'] || '';
    const extra = Object.entries(endpoint.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    headers['Cookie'] = existing ? `${existing}; ${extra}` : extra;
  }

  return headers;
}

// ── Fetch wrapper ──

export async function apiFetch(
  url: string,
  method: HttpMethod | string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; headers: Record<string, string>; body: unknown; duration: number }> {
  const start = performance.now();
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(30_000),
  };
  if (body !== undefined && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const duration = Math.round(performance.now() - start);

  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { resHeaders[k] = v; });

  let resBody: unknown;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { resBody = await res.json(); } catch { resBody = await res.text(); }
  } else {
    resBody = await res.text();
  }

  return { status: res.status, headers: resHeaders, body: resBody, duration };
}

// ── Path slug ──

export function pathSlug(endpoint: EndpointConfig): string {
  const slug = endpoint.path.replace(/[/:]/g, '_').replace(/^_+|_+$/g, '');
  return `${endpoint.method}_${slug}`;
}

// ── ID generator ──

let _counter = 0;
export function nextId(prefix: string): string {
  return `${prefix}_${++_counter}`;
}

// ── Safe JSON parse ──

export function safeJsonParse(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

// ── Ensure dir ──

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

// ── Deep clone ──

export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ── Print table ──

export function printTable(rows: string[][], headers: string[]): void {
  const c = getColors();
  const cols = headers.length;
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length)),
  );

  const sep = widths.map(w => '─'.repeat(w + 2)).join('┼');
  const fmt = (row: string[]) => row.map((cell, i) => ` ${(cell || '').padEnd(widths[i])} `).join('│');

  console.log(c.bold(fmt(headers)));
  console.log(sep);
  rows.forEach(r => console.log(fmt(r)));
}
