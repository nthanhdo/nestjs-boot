/** Prefix for client proxy injection tokens */
export const TRANSPORT_CLIENT_PREFIX = 'TRANSPORT_CLIENT_';

/** Token for TransportOptions in DI */
export const TRANSPORT_OPTIONS = 'TRANSPORT_OPTIONS';

/** Map from our string keys to NestJS Transport enum values */
export const TRANSPORT_TYPE_MAP = {
  grpc: 4,   // Transport.GRPC
  tcp: 0,    // Transport.TCP
  nats: 1,   // Transport.NATS
  rabbitmq: 5, // Transport.RMQ
} as const;
