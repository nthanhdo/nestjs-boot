import * as Joi from 'joi';

const connectionSchema = Joi.object({
  writerUri: Joi.string().uri().required().messages({
    'string.uri': 'writerUri must be a valid MongoDB URI',
    'any.required': 'writerUri is required for each database connection',
  }),
  readerUri: Joi.string().uri().optional(),
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
  url: Joi.string().required().messages({
    'any.required': 'Redis url is required when redis cache is configured',
  }),
});

const memcachedSchema = Joi.object({
  url: Joi.string().required().messages({
    'any.required':
      'Memcached url is required when memcached cache is configured',
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
}).options({ abortEarly: false });

/**
 * Validate BootOptions, throwing with clear messages on failure.
 */
export function validateBootOptions<T>(options: T): T {
  const { error, value } = bootOptionsSchema.validate(options);
  if (error) {
    const messages = error.details.map((d) => `  - ${d.message}`).join('\n');
    throw new Error(
      `[nestjs-boot] Invalid configuration:\n${messages}`,
    );
  }
  return value as T;
}
