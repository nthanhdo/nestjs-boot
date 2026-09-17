import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BootRpcExceptionFilter } from './rpc-exception.filter';
import { RPC_OPTIONS } from './constants';

export interface RpcOptions {
  /** Service name included in error responses for debugging / tracing. */
  serviceName?: string;
}

/**
 * RpcModule — registers BootRpcExceptionFilter as a global RPC exception filter.
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [RpcModule.register({ serviceName: 'order-service' })],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class RpcModule {
  static register(options?: RpcOptions): DynamicModule {
    const opts: RpcOptions = options ?? {};

    const filterInstance = new BootRpcExceptionFilter({ serviceName: opts.serviceName });

    return {
      module: RpcModule,
      providers: [
        {
          provide: RPC_OPTIONS,
          useValue: opts,
        },
        {
          provide: APP_FILTER,
          useValue: filterInstance,
        },
        {
          provide: BootRpcExceptionFilter,
          useValue: filterInstance,
        },
      ],
      exports: [RPC_OPTIONS, BootRpcExceptionFilter],
    };
  }
}
