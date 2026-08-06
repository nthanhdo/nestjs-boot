export interface InterServiceAuthOptions {
  /** Which credentials to propagate: jwt, api-key, or both */
  propagation: 'jwt' | 'api-key' | 'both';
  /** Static service-to-service token used when no user context is present */
  serviceToken?: string;
  /** Custom auth header name (default: 'Authorization') */
  headerName?: string;
  /** Custom API key header name (default: 'x-api-key') */
  apiKeyHeaderName?: string;
}

export interface AuthContext {
  /** Bearer token extracted from incoming request */
  token?: string;
  /** API key extracted from incoming request */
  apiKey?: string;
  /** Arbitrary metadata to propagate */
  metadata?: Record<string, string>;
}
