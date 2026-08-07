/** Prefix for client proxy injection tokens */
export const TRANSPORT_CLIENT_PREFIX = 'TRANSPORT_CLIENT_';

/** Token for TransportOptions in DI */
export const TRANSPORT_OPTIONS = 'TRANSPORT_OPTIONS';

/** Map from our string keys to NestJS Transport enum values */
let transportEnum: Record<string, number> | undefined;
try {
  const ms = require('@nestjs/microservices');
  transportEnum = ms.Transport;
} catch {
  // @nestjs/microservices not installed — use fallback values
}

export const TRANSPORT_TYPE_MAP = {
  grpc: transportEnum?.GRPC ?? 4,
  tcp: transportEnum?.TCP ?? 0,
  nats: transportEnum?.NATS ?? 1,
  rabbitmq: transportEnum?.RMQ ?? 5,
} as const;
