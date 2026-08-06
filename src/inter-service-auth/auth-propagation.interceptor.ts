import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { INTER_SERVICE_AUTH_OPTIONS, DEFAULT_AUTH_HEADER, DEFAULT_API_KEY_HEADER } from './constants';
import { InterServiceAuthOptions } from './interfaces';
import { authContextStorage } from './auth-context.storage';

/**
 * AuthPropagationInterceptor — extracts auth credentials from incoming requests
 * and stores them in AsyncLocalStorage so they can be propagated to outgoing
 * inter-service calls.
 *
 * Applied globally when InterServiceAuthModule is registered.
 */
@Injectable()
export class AuthPropagationInterceptor implements NestInterceptor {
  private readonly authHeader: string;
  private readonly apiKeyHeader: string;
  private readonly propagation: 'jwt' | 'api-key' | 'both';
  private readonly serviceToken?: string;

  constructor(
    @Inject(INTER_SERVICE_AUTH_OPTIONS)
    options: InterServiceAuthOptions,
  ) {
    this.authHeader = (options.headerName ?? DEFAULT_AUTH_HEADER).toLowerCase();
    this.apiKeyHeader = (options.apiKeyHeaderName ?? DEFAULT_API_KEY_HEADER).toLowerCase();
    this.propagation = options.propagation;
    this.serviceToken = options.serviceToken;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = this.getRequest(context);
    const headers = request?.headers ?? {};

    let token: string | undefined;
    let apiKey: string | undefined;

    // Extract JWT
    if (this.propagation === 'jwt' || this.propagation === 'both') {
      const authValue = headers[this.authHeader];
      if (typeof authValue === 'string' && authValue.startsWith('Bearer ')) {
        token = authValue.slice(7);
      }
    }

    // Extract API key
    if (this.propagation === 'api-key' || this.propagation === 'both') {
      const keyValue = headers[this.apiKeyHeader];
      if (typeof keyValue === 'string') {
        apiKey = keyValue;
      }
    }

    // Fallback to service token when no user context
    if (!token && !apiKey && this.serviceToken) {
      token = this.serviceToken;
    }

    const authContext = { token, apiKey, metadata: {} };

    return new Observable((subscriber) => {
      authContextStorage.run(authContext, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }

  private getRequest(context: ExecutionContext): any {
    // HTTP context
    try {
      const req = context.switchToHttp().getRequest();
      if (req?.headers) return req;
    } catch {
      // not HTTP context
    }

    // RPC context — try to extract metadata
    try {
      const rpcCtx = context.switchToRpc().getContext();
      if (rpcCtx) return { headers: rpcCtx };
    } catch {
      // not RPC context
    }

    return { headers: {} };
  }
}
