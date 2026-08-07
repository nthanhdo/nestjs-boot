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
/**
 * Validate transport options at module init time.
 * Throws clear error messages for missing required fields.
 */
export function validateTransportOptions(options: TransportOptions): void {
  if (options.grpc) {
    if (!options.grpc.url) {
      throw new Error('[nestjs-boot] gRPC transport requires `url` (e.g., "0.0.0.0:5000")');
    }
    if (!options.grpc.package) {
      throw new Error('[nestjs-boot] gRPC transport requires `package` (proto package name)');
    }
    if (!options.grpc.protoPath) {
      throw new Error('[nestjs-boot] gRPC transport requires `protoPath` (path to .proto file)');
    }
  }

  if (options.tcp) {
    // TCP has sensible defaults, but warn if port conflicts
    const port = options.tcp.port ?? 3001;
    if (port < 0 || port > 65535) {
      throw new Error(`[nestjs-boot] TCP transport port must be 0–65535, got ${port}`);
    }
  }

  if (options.nats) {
    if (!options.nats.url) {
      throw new Error('[nestjs-boot] NATS transport requires `url` (e.g., "nats://localhost:4222")');
    }
  }

  if (options.rabbitmq) {
    if (!options.rabbitmq.urls || options.rabbitmq.urls.length === 0) {
      throw new Error('[nestjs-boot] RabbitMQ transport requires `urls` (array of AMQP URLs)');
    }
    if (!options.rabbitmq.queue) {
      throw new Error('[nestjs-boot] RabbitMQ transport requires `queue` (queue name)');
    }
  }
}

export async function connectTransports(
  app: INestApplication,
  options: TransportOptions,
): Promise<void> {
  // Validate options before connecting
  validateTransportOptions(options);

  let hasAnyTransport = false;

  if (options.grpc) {
    logger.log(`Connecting gRPC transport on ${options.grpc.url}`);
    app.connectMicroservice(
      {
        transport: TRANSPORT_TYPE_MAP.grpc,
        options: {
          url: options.grpc.url,
          package: options.grpc.package,
          protoPath: options.grpc.protoPath,
          loader: options.grpc.loader,
          credentials: options.grpc.credentials,
        },
      },
      { inheritAppConfig: true },
    );
    hasAnyTransport = true;
  }

  if (options.tcp) {
    const host = options.tcp.host ?? '0.0.0.0';
    const port = options.tcp.port ?? 3001;
    logger.log(`Connecting TCP transport on ${host}:${port}`);
    app.connectMicroservice(
      {
        transport: TRANSPORT_TYPE_MAP.tcp,
        options: { host, port },
      },
      { inheritAppConfig: true },
    );
    hasAnyTransport = true;
  }

  if (options.nats) {
    logger.log(`Connecting NATS transport on ${options.nats.url}`);
    app.connectMicroservice(
      {
        transport: TRANSPORT_TYPE_MAP.nats,
        options: {
          url: options.nats.url,
          queue: options.nats.queue,
        },
      },
      { inheritAppConfig: true },
    );
    hasAnyTransport = true;
  }

  if (options.rabbitmq) {
    logger.log(`Connecting RabbitMQ transport on queue "${options.rabbitmq.queue}"`);
    app.connectMicroservice(
      {
        transport: TRANSPORT_TYPE_MAP.rabbitmq,
        options: {
          urls: options.rabbitmq.urls,
          queue: options.rabbitmq.queue,
          queueOptions: options.rabbitmq.queueOptions,
        },
      },
      { inheritAppConfig: true },
    );
    hasAnyTransport = true;
  }

  if (hasAnyTransport) {
    await app.startAllMicroservices();
    logger.log('All microservice transports started');
  }
}
