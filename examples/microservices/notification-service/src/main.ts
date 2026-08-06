import { createApp } from 'nestjs-boot';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const protoDir = join(__dirname, '..', '..', 'proto');

  const app = await createApp(AppModule, {
    database: {
      connections: {
        master: {
          writerUri:
            process.env.MONGO_URI || 'mongodb://localhost:27017/notifications',
        },
      },
    },
    events: {
      transport: 'redis',
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
    },
    queue: {
      driver: 'bullmq',
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
      defaultOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    },
    transport: {
      grpc: {
        url: '0.0.0.0:5000',
        package: 'notification',
        protoPath: join(protoDir, 'notification.proto'),
      },
    },
    correlation: {},
    health: { enabled: true },
    response: { errorHandler: true },
  });

  await app.listen(3004);
  console.log(
    'Notification Service listening on :3004 (HTTP) and :5000 (gRPC)',
  );
}

bootstrap();
