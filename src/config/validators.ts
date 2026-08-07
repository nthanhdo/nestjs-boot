import * as Joi from 'joi';
import { BootOptions } from '../interfaces/boot-options.interface';

const connectionOptionsSchema = Joi.object().pattern(
  Joi.string(),
  Joi.any(),
).optional();

const connectionSchema = Joi.object({
  writerUri: Joi.string().uri().pattern(/^mongodb(\+srv)?:\/\//).required().messages({
    'string.uri': 'writerUri must be a valid MongoDB URI',
    'string.pattern.base': 'writerUri must start with mongodb:// or mongodb+srv://',
    'any.required': 'writerUri is required for each database connection',
  }),
  readerUri: Joi.string().uri().pattern(/^mongodb(\+srv)?:\/\//).optional().messages({
    'string.pattern.base': 'readerUri must start with mongodb:// or mongodb+srv://',
  }),
  options: connectionOptionsSchema,
});

const databaseSchema = Joi.object({
  connections: Joi.object()
    .pattern(Joi.string(), connectionSchema)
    .min(1)
    .required()
    .messages({
      'object.min': 'At least one database connection must be defined',
    }),
});

const redisSchema = Joi.object({
  url: Joi.string().pattern(/^rediss?:\/\//).required().messages({
    'string.pattern.base': 'Redis url must start with redis:// or rediss://',
    'any.required': 'Redis url is required when redis cache is configured',
  }),
});

const memcachedSchema = Joi.object({
  servers: Joi.string().required().messages({
    'any.required': 'Memcached servers string is required when memcached is configured',
  }),
});

const cacheSchema = Joi.object({
  redis: redisSchema.optional(),
  memcached: memcachedSchema.optional(),
  defaultTtl: Joi.number().integer().min(1).default(300),
});

const responseSchema = Joi.object({
  envelope: Joi.boolean().default(false),
  errorHandler: Joi.boolean().default(true),
});

const healthSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  path: Joi.string().default('/health'),
});

/**
 * Joi schema for the master BootOptions config.
 * Validates all sections — fail fast on invalid config.
 */
export const bootOptionsSchema = Joi.object({
  database: databaseSchema.optional(),
  cache: cacheSchema.optional(),
  response: responseSchema.optional().default({ envelope: false, errorHandler: true }),
  health: healthSchema.optional().default({ enabled: true, path: '/health' }),
  logger: Joi.any().optional(),
  auth: Joi.object({
    jwt: Joi.object({
      secret: Joi.string().min(8).required(),
      signOptions: Joi.object({
        expiresIn: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
        algorithm: Joi.string().optional(),
      }).optional(),
      refreshSecret: Joi.string().optional(),
      refreshExpiresIn: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
    }).optional(),
    apiKey: Joi.object({
      enabled: Joi.boolean().required(),
      headerName: Joi.string().optional(),
      validate: Joi.function().required(),
    }).optional(),
    rbac: Joi.object({
      enabled: Joi.boolean().required(),
      extractRoles: Joi.function().optional(),
      extractPermissions: Joi.function().optional(),
    }).optional(),
  }).optional(),
  correlation: Joi.object({
    header: Joi.string().optional(),
    generator: Joi.function().optional(),
  }).optional(),
  shutdown: Joi.object({
    timeout: Joi.number().integer().min(0).optional(),
    signals: Joi.array().items(Joi.string()).optional(),
  }).optional(),
  interServiceAuth: Joi.object({
    propagation: Joi.boolean().optional(),
    serviceToken: Joi.string().optional(),
    headerName: Joi.string().optional(),
  }).optional(),
  transport: Joi.object({
    grpc: Joi.object({
      url: Joi.string().required().messages({
        'any.required': 'gRPC url is required (e.g., "0.0.0.0:5000")',
      }),
      package: Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.string()),
      ).required().messages({
        'any.required': 'gRPC package name is required',
      }),
      protoPath: Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.string()),
      ).required().messages({
        'any.required': 'gRPC protoPath is required',
      }),
      loader: Joi.object({
        keepCase: Joi.boolean().optional(),
        longs: Joi.function().optional(),
        enums: Joi.function().optional(),
        defaults: Joi.boolean().optional(),
        oneofs: Joi.boolean().optional(),
        includeDirs: Joi.array().items(Joi.string()).optional(),
      }).optional(),
      credentials: Joi.any().optional(),
    }).optional(),
    tcp: Joi.object({
      host: Joi.string().optional(),
      port: Joi.number().integer().min(1).max(65535).optional(),
    }).optional(),
    nats: Joi.object({
      url: Joi.string().required().messages({
        'any.required': 'NATS url is required',
      }),
      queue: Joi.string().optional(),
    }).optional(),
    rabbitmq: Joi.object({
      urls: Joi.array().items(Joi.string()).min(1).required().messages({
        'any.required': 'RabbitMQ urls array is required',
        'array.min': 'At least one RabbitMQ URL must be provided',
      }),
      queue: Joi.string().required().messages({
        'any.required': 'RabbitMQ queue name is required',
      }),
      queueOptions: Joi.object({
        durable: Joi.boolean().optional(),
      }).optional(),
    }).optional(),
    clients: Joi.object().pattern(
      Joi.string(),
      Joi.object({
        transport: Joi.string().valid('grpc', 'tcp', 'nats', 'rabbitmq').required(),
        options: Joi.object().required(),
      }),
    ).optional(),
  }).optional(),
  metrics: Joi.object({
    enabled: Joi.boolean().optional().default(true),
    path: Joi.string().optional(),
    prefix: Joi.string().optional(),
    defaultMetrics: Joi.boolean().optional().default(true),
  }).optional(),
  logging: Joi.object({
    level: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').optional().default('info'),
    pretty: Joi.boolean().optional(),
    redact: Joi.array().items(Joi.string()).optional(),
  }).optional(),
  tracing: Joi.object({
    enabled: Joi.boolean().optional(),
    exporter: Joi.string().valid('otlp', 'jaeger', 'zipkin', 'console').required(),
    endpoint: Joi.string().optional(),
    serviceName: Joi.string().optional(),
    sampleRate: Joi.number().min(0).max(1).optional(),
  }).optional(),
  resilience: Joi.object({
    circuitBreaker: Joi.object({
      failureThreshold: Joi.number().integer().min(1).optional(),
      resetTimeout: Joi.number().integer().min(0).optional(),
      halfOpenMax: Joi.number().integer().min(1).optional(),
    }).optional(),
    timeout: Joi.object({
      default: Joi.number().integer().min(0).optional(),
    }).optional(),
  }).optional(),
  queue: Joi.object({
    driver: Joi.string().valid('bullmq').required(),
    redis: Joi.object({
      url: Joi.string().pattern(/^rediss?:\/\//).required(),
    }).required(),
    defaultOptions: Joi.object({
      attempts: Joi.number().integer().min(1).optional(),
      backoff: Joi.object({
        type: Joi.string().valid('exponential', 'fixed').required(),
        delay: Joi.number().integer().min(0).required(),
      }).optional(),
      removeOnComplete: Joi.alternatives().try(Joi.boolean(), Joi.number()).optional(),
      removeOnFail: Joi.alternatives().try(Joi.boolean(), Joi.number()).optional(),
    }).optional(),
  }).optional(),
  events: Joi.object({
    transport: Joi.string().valid('memory', 'redis').required(),
    redis: Joi.object({
      url: Joi.string().pattern(/^rediss?:\/\//).required(),
    }).optional(),
  }).optional(),
  cqrs: Joi.object({
    eventStore: Joi.string().valid('mongodb', 'memory').required(),
    snapshotStore: Joi.string().valid('mongodb', 'memory').optional(),
    snapshotFrequency: Joi.number().integer().min(1).optional().default(100),
    outbox: Joi.object({
      enabled: Joi.boolean().required(),
      pollInterval: Joi.number().integer().min(100).optional().default(1000),
      maxRetries: Joi.number().integer().min(1).optional().default(5),
    }).optional(),
    connection: Joi.string().optional(),
  }).optional(),
  versioning: Joi.object({
    type: Joi.string().valid('uri', 'header', 'media-type').optional().default('uri'),
    defaultVersion: Joi.string().optional().default('1'),
    header: Joi.string().optional().default('X-API-Version'),
    mediaTypeKey: Joi.string().optional().default('version'),
  }).optional(),
  tenancy: Joi.object({
    strategy: Joi.string().valid('header', 'subdomain', 'path').required(),
    headerName: Joi.string().optional().default('X-Tenant-ID'),
    resolver: Joi.function().optional(),
    isolation: Joi.string().valid('database', 'schema', 'row').optional().default('row'),
  }).optional(),
  websocket: Joi.object({
    adapter: Joi.string().valid('socket.io', 'ws').optional().default('socket.io'),
    redis: Joi.object({
      url: Joi.string().pattern(/^rediss?:\/\//).required().messages({
        'string.pattern.base': 'websocket.redis.url must start with redis:// or rediss://',
      }),
    }).optional(),
    cors: Joi.object({
      origin: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).required(),
    }).optional(),
    path: Joi.string().optional().default('/socket.io'),
    namespaces: Joi.array().items(Joi.string()).optional(),
  }).optional(),
}).options({ abortEarly: false, stripUnknown: false });

/**
 * Validate BootOptions, throwing with clear messages on failure.
 */
export function validateBootOptions(options: BootOptions): BootOptions {
  const { error, value } = bootOptionsSchema.validate(options);
  if (error) {
    const messages = error.details.map((d) => `  - ${d.message}`).join('\n');
    throw new Error(
      `[nestjs-boot] Invalid configuration:\n${messages}`,
    );
  }
  return value as BootOptions;
}
