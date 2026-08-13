export interface ApiTestConfig {
  host: string;
  basePath?: string;
  auth?: AuthConfig;
  headers?: Record<string, string>;
  endpoints: EndpointConfig[];
  outputDir?: string;
  categories?: MutationCategory[];
}

export interface AuthConfig {
  type: 'bearer' | 'api-key' | 'cookie' | 'basic' | 'none';
  token?: string;
  headerName?: string;
  cookieName?: string;
  cookieValue?: string;
  username?: string;
  password?: string;
}

export interface EndpointConfig {
  method: HttpMethod;
  path: string;
  description?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  cookies?: Record<string, string>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RecordedResponse {
  endpoint: EndpointConfig;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
  timestamp: string;
}

export interface TestCase {
  id: string;
  name: string;
  category: MutationCategory;
  description: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
    cookies?: Record<string, string>;
  };
  expect: {
    status: number | number[];
    bodyContains?: string[];
    bodyNotContains?: string[];
    headerPresent?: string[];
  };
  mutation: string;
}

export interface TestResult {
  testCase: TestCase;
  actual: {
    status: number;
    body: unknown;
    headers: Record<string, string>;
    duration: number;
  };
  passed: boolean;
  reason?: string;
}

export interface TestSuite {
  endpoint: EndpointConfig;
  happyCase: RecordedResponse;
  testCases: TestCase[];
}

export type MutationCategory = 'auth' | 'body' | 'params' | 'headers' | 'edge' | 'method';

export interface FieldMeta {
  name: string;
  path: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'unknown';
  pattern?: 'email' | 'url' | 'uuid' | 'date' | 'iso-date';
  required: boolean;
  value: unknown;
}

export interface PayloadSchema {
  fields: FieldMeta[];
  raw: unknown;
}

export interface MutationModule {
  name: MutationCategory;
  generate(endpoint: EndpointConfig, happyCase: RecordedResponse, schema: PayloadSchema | null, config: ApiTestConfig): TestCase[];
}
