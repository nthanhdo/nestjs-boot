import { INestApplication } from '@nestjs/common';

/**
 * A test client for calling gRPC service handlers in-process.
 * No actual gRPC server is started — handlers are resolved from NestJS DI and called directly.
 */
export interface GrpcTestClient {
  /**
   * Call a @GrpcMethod handler by method name.
   *
   * ```ts
   * const result = await client.call('FindOne', { id: '123' });
   * ```
   */
  call<R = any>(methodName: string, data?: any, metadata?: Record<string, string>): Promise<R>;

  /**
   * List all available method names on the resolved service.
   */
  listMethods(): string[];
}

/**
 * Create a typed gRPC test client that calls handlers in-process.
 * No actual gRPC server needed — resolves the controller from NestJS DI
 * and calls @GrpcMethod handlers directly.
 *
 * ```ts
 * const client = createGrpcTestClient(app, 'OrderService');
 * const order = await client.call('FindOne', { id: '123' });
 * ```
 *
 * @param app - NestJS application instance (from createTestApp)
 * @param serviceName - The gRPC service name (used to find the controller via DI token)
 * @param serviceToken - Optional DI token if the service is registered under a custom token.
 *                       If not provided, attempts to resolve by serviceName string token.
 */
export function createGrpcTestClient(
  app: INestApplication,
  serviceName: string,
  serviceToken?: any,
): GrpcTestClient {
  // Resolve the service instance from DI
  const token = serviceToken ?? serviceName;
  let serviceInstance: Record<string, any>;

  try {
    serviceInstance = app.get(token);
  } catch {
    throw new Error(
      `[nestjs-boot] GrpcTestClient: Could not resolve "${serviceName}" from DI container. ` +
      `Make sure the service is provided in your test module, or pass a custom serviceToken.`,
    );
  }

  return {
    async call<R = any>(methodName: string, data?: any, _metadata?: Record<string, string>): Promise<R> {
      if (typeof serviceInstance[methodName] !== 'function') {
        const available = Object.getOwnPropertyNames(Object.getPrototypeOf(serviceInstance))
          .filter((m) => m !== 'constructor' && typeof serviceInstance[m] === 'function');
        throw new Error(
          `[nestjs-boot] GrpcTestClient: Method "${methodName}" not found on "${serviceName}". ` +
          `Available methods: ${available.join(', ') || 'none'}`,
        );
      }

      const result = await serviceInstance[methodName](data);
      return result as R;
    },

    listMethods(): string[] {
      return Object.getOwnPropertyNames(Object.getPrototypeOf(serviceInstance))
        .filter((m) => m !== 'constructor' && typeof serviceInstance[m] === 'function');
    },
  };
}
