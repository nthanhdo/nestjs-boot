import { DynamicModule, Module, Provider, Logger } from '@nestjs/common';
import { TransportOptions, ClientTransportOptions } from './interfaces';
import { TRANSPORT_OPTIONS, TRANSPORT_TYPE_MAP } from './constants';
import { getClientToken } from './decorators';

/**
 * TransportModule — registers named client proxies for inter-service communication.
 *
 * Clients are created via `ClientProxyFactory.create()` from @nestjs/microservices.
 * If @nestjs/microservices is not installed, the module logs a warning and provides
 * no clients (graceful degradation).
 *
 * Usage:
 * ```ts
 * TransportModule.register({
 *   clients: {
 *     ORDER_SERVICE: {
 *       transport: 'grpc',
 *       options: { url: '0.0.0.0:5000', package: 'order', protoPath: '...' },
 *     },
 *   },
 * })
 * ```
 */
@Module({})
export class TransportModule {
  private static readonly logger = new Logger(TransportModule.name);

  static register(options: TransportOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: TRANSPORT_OPTIONS, useValue: options },
    ];
    const exportTokens: string[] = [];

    if (options.clients) {
      let ClientProxyFactory: any;
      try {
         
        const microservices = require('@nestjs/microservices');
        ClientProxyFactory = microservices.ClientProxyFactory;
      } catch {
        this.logger.warn(
          '@nestjs/microservices is not installed. Transport clients will not be registered. ' +
            'Install it to use inter-service communication: npm i @nestjs/microservices',
        );
      }

      if (ClientProxyFactory) {
        for (const [name, clientOpts] of Object.entries(options.clients)) {
          const token = getClientToken(name);
          providers.push({
            provide: token,
            useFactory: () => {
              const nestTransport = TRANSPORT_TYPE_MAP[clientOpts.transport];
              return ClientProxyFactory.create({
                transport: nestTransport,
                options: this.mapClientOptions(clientOpts),
              });
            },
          });
          exportTokens.push(token);
        }
      }
    }

    return {
      module: TransportModule,
      global: true,
      providers,
      exports: [TRANSPORT_OPTIONS, ...exportTokens],
    };
  }

  /**
   * Map our interface options to the shape @nestjs/microservices expects.
   */
  private static mapClientOptions(clientOpts: ClientTransportOptions): Record<string, unknown> {
    const { transport, options } = clientOpts;

    switch (transport) {
      case 'grpc':
        return options as Record<string, unknown>;
      case 'tcp':
        return options as Record<string, unknown>;
      case 'nats':
        return options as Record<string, unknown>;
      case 'rabbitmq':
        return options as Record<string, unknown>;
      default:
        return options as Record<string, unknown>;
    }
  }
}
