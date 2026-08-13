import { join } from 'path';
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {
{{#eq dbType "mongodb"}}
    database: {
      connections: {
        master: {
          writerUri: process.env.MONGO_URI || 'mongodb://localhost:27017/{{name}}',
        },
      },
    },
{{/eq}}
{{#if cache}}
{{#eq cacheType "redis"}}
    cache: {
      redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    },
{{/eq}}
{{#eq cacheType "memcached"}}
    cache: {
      memcached: { servers: process.env.MEMCACHED_SERVERS || 'localhost:11211' },
    },
{{/eq}}
{{/if}}
{{#eq transportType "grpc"}}
    transport: {
      grpc: {
        url: '0.0.0.0:5000',
        package: '{{name}}',
        protoPath: join(__dirname, '../proto/{{name}}.proto'),
      },
    },
{{/eq}}
{{#eq transportType "tcp"}}
    transport: {
      tcp: {
        host: '0.0.0.0',
        port: 4000,
      },
    },
{{/eq}}
{{#eq transportType "nats"}}
    transport: {
      nats: {
        url: process.env.NATS_URL || 'nats://localhost:4222',
      },
    },
{{/eq}}
{{#eq transportType "rabbitmq"}}
    transport: {
      rabbitmq: {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
      },
    },
{{/eq}}
{{#if auth}}
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET || 'change-me-in-production',
      },
    },
{{/if}}
    health: { enabled: true },
  });

  await app.listen(process.env.PORT || 3000);
  console.log(`{{name}} running on port ${process.env.PORT || 3000}`);
}
bootstrap();
