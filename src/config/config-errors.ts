import * as Joi from 'joi';

/**
 * Maps each known BootOptions config path to the env var name that provides it
 * and a short description of what it configures.
 *
 * Used by `formatConfigError()` to produce actionable error messages.
 */
const CONFIG_PATH_MAP: Record<string, { envVar?: string; description: string }> = {
  'database.connections': {
    description: 'MongoDB connection map (at least one entry required)',
  },
  'database.connections.master.writerUri': {
    envVar: 'MONGO_URI',
    description: 'Primary MongoDB write URI',
  },
  'database.connections.master.readerUri': {
    envVar: 'MONGO_READ_URI',
    description: 'MongoDB read-replica URI (optional)',
  },
  'cache.redis.url': {
    envVar: 'REDIS_URL',
    description: 'Redis connection URL for L2 cache',
  },
  'cache.memcached.servers': {
    envVar: 'MEMCACHED_SERVERS',
    description: 'Memcached server list (comma-separated)',
  },
  'auth.jwt.secret': {
    envVar: 'JWT_SECRET',
    description: 'JWT signing secret (minimum 8 characters)',
  },
  'auth.jwt.refreshSecret': {
    envVar: 'JWT_REFRESH_SECRET',
    description: 'JWT refresh token signing secret',
  },
  'transport.grpc.url': {
    envVar: 'GRPC_URL',
    description: 'gRPC server bind address (e.g. "0.0.0.0:5000")',
  },
  'transport.grpc.package': {
    envVar: 'GRPC_PACKAGE',
    description: 'gRPC protobuf package name',
  },
  'transport.grpc.protoPath': {
    envVar: 'GRPC_PROTO_PATH',
    description: 'Path to .proto file(s)',
  },
  'transport.nats.url': {
    envVar: 'NATS_URL',
    description: 'NATS server URL (e.g. "nats://localhost:4222")',
  },
  'transport.rabbitmq.urls': {
    envVar: 'RABBITMQ_URLS',
    description: 'RabbitMQ connection URL(s)',
  },
  'transport.rabbitmq.queue': {
    envVar: 'RABBITMQ_QUEUE',
    description: 'RabbitMQ queue name for this service',
  },
  'queue.redis.url': {
    envVar: 'QUEUE_REDIS_URL',
    description: 'Redis URL for BullMQ job queue',
  },
  'events.redis.url': {
    envVar: 'EVENTS_REDIS_URL',
    description: 'Redis URL for the event bus',
  },
  'tracing.exporter': {
    envVar: 'TRACING_EXPORTER',
    description: 'OpenTelemetry exporter type (otlp | jaeger | zipkin | console)',
  },
  'tracing.endpoint': {
    envVar: 'OTEL_EXPORTER_OTLP_ENDPOINT',
    description: 'OpenTelemetry collector endpoint URL',
  },
};

/**
 * Format a Joi ValidationError into a human-readable message that suggests
 * the specific fix rather than just stating the problem.
 *
 * Instead of:
 *   "database.connections.master.writerUri is required"
 *
 * Shows:
 *   "Missing database connection URI (MONGO_URI). Set MONGO_URI in .env or pass
 *    database.connections.master.writerUri in createApp() options."
 *
 * @param joiError - The Joi validation error from schema.validate()
 * @returns Formatted multi-line string ready to print to stderr/logger
 */
export function formatConfigError(joiError: Joi.ValidationError): string {
  const lines: string[] = ['[nestjs-boot] Configuration errors found:\n'];

  for (const detail of joiError.details) {
    const path = detail.path.join('.');
    const hint = lookupHint(path, detail.message);
    lines.push(`  ✗ ${hint}`);
  }

  lines.push(
    '\nQuick-fix checklist:',
    '  1. Check your .env file — run: cat .env | grep -i <KEY>',
    '  2. Verify createApp() options object has the required field.',
    '  3. If using async secrets loader, confirm the loader is resolving correctly.',
  );

  return lines.join('\n');
}

/**
 * Look up a human-readable hint for a config path.
 * Falls back to the raw Joi message if the path isn't in the map.
 */
function lookupHint(path: string, joiMessage: string): string {
  // Try exact match first
  const entry = CONFIG_PATH_MAP[path];
  if (entry) {
    return buildHint(path, entry.envVar, entry.description, joiMessage);
  }

  // Try pattern match — replace connection names with 'master' to find a template
  const normalized = path.replace(/\.connections\.[^.]+\./, '.connections.master.');
  const normalizedEntry = CONFIG_PATH_MAP[normalized];
  if (normalizedEntry) {
    return buildHint(path, normalizedEntry.envVar, normalizedEntry.description, joiMessage);
  }

  // Fallback: enhance Joi's own message with fix suggestions
  return `${joiMessage}\n    → Set "${path}" in your createApp() options or the corresponding env var in .env`;
}

function buildHint(
  path: string,
  envVar: string | undefined,
  description: string,
  joiMessage: string,
): string {
  const parts: string[] = [description, `(config path: ${path})`];

  if (envVar) {
    parts.push(`\n    → Fix: set ${envVar}=<value> in .env`);
    parts.push(`    → Or:  pass { ${path}: '...' } in createApp() options`);
  } else {
    parts.push(`\n    → Fix: pass "${path}" in createApp() options`);
  }

  parts.push(`    → Joi detail: ${joiMessage}`);

  return parts.join(' ');
}
