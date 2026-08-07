import { INestApplication } from '@nestjs/common';

/**
 * Response from the test client — auto-unwraps the envelope if present.
 */
export interface TestResponse<T = any> {
  /** HTTP status code */
  status: number;
  /** Response body — if envelope format, this is the `data` field */
  data: T;
  /** Raw response body before unwrapping */
  raw: any;
  /** Response headers */
  headers: Record<string, string>;
}

/**
 * Lightweight HTTP test client that understands the Boot response envelope.
 *
 * ```ts
 * const client = createTestClient(app);
 * const { data, status } = await client.get('/products');
 * const { data } = await client.post('/products', { name: 'Test' });
 * ```
 */
export interface TestClient {
  get<T = any>(url: string, headers?: Record<string, string>): Promise<TestResponse<T>>;
  post<T = any>(url: string, body?: any, headers?: Record<string, string>): Promise<TestResponse<T>>;
  put<T = any>(url: string, body?: any, headers?: Record<string, string>): Promise<TestResponse<T>>;
  patch<T = any>(url: string, body?: any, headers?: Record<string, string>): Promise<TestResponse<T>>;
  delete<T = any>(url: string, headers?: Record<string, string>): Promise<TestResponse<T>>;
  /** Set a default Authorization header for all requests */
  setBearerToken(token: string): void;
}

/**
 * Create a test HTTP client from a NestJS app instance.
 * Auto-unwraps the Boot response envelope (`{ success, data, meta }`).
 */
export function createTestClient(app: INestApplication): TestClient {
  let defaultHeaders: Record<string, string> = {};

  async function request<T>(
    method: string,
    url: string,
    body?: any,
    headers?: Record<string, string>,
  ): Promise<TestResponse<T>> {
    // Use supertest if available, otherwise fall back to http server
    let supertest: any;
    try {
      supertest = require('supertest');
    } catch {
      throw new Error(
        'supertest is required for createTestClient. Install it: npm i -D supertest',
      );
    }

    const httpServer = app.getHttpServer();
    let req = supertest(httpServer)[method.toLowerCase()](url);

    // Apply headers
    const allHeaders = { ...defaultHeaders, ...headers };
    for (const [key, value] of Object.entries(allHeaders)) {
      req = req.set(key, value);
    }

    // Apply body for methods that support it
    if (body !== undefined && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
      req = req.send(body);
    }

    const res = await req;

    // Unwrap envelope if present
    const raw = res.body;
    let data: T;
    if (
      raw &&
      typeof raw === 'object' &&
      'success' in raw &&
      'data' in raw
    ) {
      data = raw.data as T;
    } else {
      data = raw as T;
    }

    return {
      status: res.status,
      data,
      raw,
      headers: res.headers,
    };
  }

  return {
    get: <T>(url: string, headers?: Record<string, string>) =>
      request<T>('get', url, undefined, headers),
    post: <T>(url: string, body?: any, headers?: Record<string, string>) =>
      request<T>('post', url, body, headers),
    put: <T>(url: string, body?: any, headers?: Record<string, string>) =>
      request<T>('put', url, body, headers),
    patch: <T>(url: string, body?: any, headers?: Record<string, string>) =>
      request<T>('patch', url, body, headers),
    delete: <T>(url: string, headers?: Record<string, string>) =>
      request<T>('delete', url, undefined, headers),
    setBearerToken(token: string) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    },
  };
}
