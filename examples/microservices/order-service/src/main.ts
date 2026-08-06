import { createApp } from 'nestjs-boot';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const protoDir = join(__dirname, '..', '..', 'proto');

  const app = await createApp(AppModule, {
    database: {
      connections: {
        master: {
          writerUri: process.env.MONGO_URI || 'mongodb://localhost:27017/orders',
        },
      },
    },
    cache: {
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
      defaultTtl: 60,
    },
    transport: {
      grpc: {
        url: '0.0.0.0:5000',
        package: 'order',
        protoPath: join(protoDir, 'order.proto'),
      },
    },
    correlation: {},
    health: { enabled: true },
    response: { errorHandler: true },
  });

  await app.listen(3001);
  console.log('Order Service listening on :3001 (HTTP) and :5000 (gRPC)');
}

bootstrap();
