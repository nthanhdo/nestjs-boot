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
