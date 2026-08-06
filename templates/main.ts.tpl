import { join } from 'path';
import { createApp } from 'nestjs-boot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await createApp(AppModule, {
    database: {
      connections: {
        master: {
          writerUri: process.env.MONGO_URI || 'mongodb://localhost:27017/{{name}}',
        },
      },
    },
    {{#if cache}}
    cache: {
      redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    },
    {{/if}}
    {{#if grpc}}
    transport: {
      grpc: {
        url: '0.0.0.0:5000',
        package: '{{name}}',
        protoPath: join(__dirname, '../proto/{{name}}.proto'),
      },
    },
    {{/if}}
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
