/**
 * Contract Testing — Mock gRPC Service.
 *
 * Creates a plain object that mimics a gRPC service for use in NestJS
 * testing modules. No real gRPC server needed.
 *
 * ```ts
 * const mock = createMockGrpcService({
 *   findOne: (req) => ({ id: req.id, name: 'Test' }),
 *   findAll: () => ({ items: [] }),
 * });
 * ```
 */

export type ResponseFactory<TReq = unknown, TRes = unknown> = (
  request: TReq,
) => TRes | Promise<TRes>;

export type ServiceDefinition = Record<string, ResponseFactory>;

/**
 * Create a mock gRPC service object from a definition of method names → response factories.
 * Usable as a custom provider in `Test.createTestingModule({ providers: [...] })`.
 */
export function createMockGrpcService<T extends ServiceDefinition>(
  definition: T,
): T {
  const service = {} as Record<string, ResponseFactory>;

  for (const [methodName, factory] of Object.entries(definition)) {
    service[methodName] =
      typeof factory === 'function'
        ? factory
        : () => factory;
  }

  return service as T;
}
