import { INestApplication, Logger } from '@nestjs/common';
import { TransportOptions } from './interfaces';
import { TRANSPORT_TYPE_MAP } from './constants';

const logger = new Logger('TransportFactory');

/**
 * Connect microservice transports to an existing NestJS application.
 * Called by createApp() when transport options are provided.
 *
 * For each configured transport type (grpc, tcp, nats, rabbitmq),
 * calls `app.connectMicroservice()` then `app.startAllMicroservices()`.
 *
 * Requires @nestjs/microservices to be installed — throws clear error if missing.
 */
export async function connectTransports(
  app: INestApplication,
  options: TransportOptions,
): Promise<void> {
  let hasAnyTransport = false;

  if (options.grpc) {
    logger.log(`Connecting gRPC transport on ${options.grpc.url}`);
    app.connectMicroservice({
      transport: TRANSPORT_TYPE_MAP.grpc,
      options: {
        url: options.grpc.url,
        package: options.grpc.package,
        protoPath: options.grpc.protoPath,
        loader: options.grpc.loader,
        credentials: options.grpc.credentials,
      },
    });
    hasAnyTransport = true;
  }

  if (options.tcp) {
    const host = options.tcp.host ?? '0.0.0.0';
    const port = options.tcp.port ?? 3001;
    logger.log(`Connecting TCP transport on ${host}:${port}`);
    app.connectMicroservice({
      transport: TRANSPORT_TYPE_MAP.tcp,
      options: { host, port },
    });
    hasAnyTransport = true;
  }

  if (options.nats) {
    logger.log(`Connecting NATS transport on ${options.nats.url}`);
    app.connectMicroservice({
      transport: TRANSPORT_TYPE_MAP.nats,
      options: {
        url: options.nats.url,
        queue: options.nats.queue,
      },
    });
    hasAnyTransport = true;
  }

  if (options.rabbitmq) {
    logger.log(`Connecting RabbitMQ transport on queue "${options.rabbitmq.queue}"`);
    app.connectMicroservice({
      transport: TRANSPORT_TYPE_MAP.rabbitmq,
      options: {
        urls: options.rabbitmq.urls,
        queue: options.rabbitmq.queue,
        queueOptions: options.rabbitmq.queueOptions,
      },
    });
    hasAnyTransport = true;
  }

  if (hasAnyTransport) {
    await app.startAllMicroservices();
    logger.log('All microservice transports started');
  }
}
