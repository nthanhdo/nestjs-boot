/**
 * Transport configuration for hybrid microservice support.
 * All transport types are optional — omit to skip.
 */
export interface TransportOptions {
  /** gRPC server transport */
  grpc?: GrpcTransportOptions;
  /** TCP server transport */
  tcp?: TcpTransportOptions;
  /** NATS server transport */
  nats?: NatsTransportOptions;
  /** RabbitMQ server transport */
  rabbitmq?: RmqTransportOptions;
  /** Named client proxies for inter-service calls */
  clients?: Record<string, ClientTransportOptions>;
}

export interface GrpcTransportOptions {
  /** gRPC server bind address (e.g., '0.0.0.0:5000') */
  url: string;
  /** Proto package name(s) */
  package: string | string[];
  /** Path(s) to .proto file(s) */
  protoPath: string | string[];
  /** Proto loader options */
  loader?: {
    keepCase?: boolean;
    longs?: Function;
    enums?: Function;
    defaults?: boolean;
    oneofs?: boolean;
    includeDirs?: string[];
  };
  /** gRPC channel credentials (for mTLS) */
  credentials?: unknown;
}

export interface TcpTransportOptions {
  /** Host to bind (default: '0.0.0.0') */
  host?: string;
  /** Port to bind (default: 3001) */
  port?: number;
}

export interface NatsTransportOptions {
  /** NATS server URL */
  url: string;
  /** Queue group name */
  queue?: string;
}

export interface RmqTransportOptions {
  /** RabbitMQ connection URLs */
  urls: string[];
  /** Queue name */
  queue: string;
  /** Queue options */
  queueOptions?: { durable?: boolean };
}

export interface ClientTransportOptions {
  /** Transport type for this client */
  transport: 'grpc' | 'tcp' | 'nats' | 'rabbitmq';
  /** Transport-specific options */
  options: GrpcTransportOptions | TcpTransportOptions | NatsTransportOptions | RmqTransportOptions;
}
