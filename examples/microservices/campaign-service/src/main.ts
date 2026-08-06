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
            process.env.MONGO_URI || 'mongodb://localhost:27017/campaigns',
        },
      },
    },
    cache: {
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
      defaultTtl: 300,
    },
    events: {
      transport: 'redis',
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
    },
    transport: {
      grpc: {
        url: '0.0.0.0:5009',
        package: 'campaign',
        protoPath: join(protoDir, 'campaign.proto'),
      },
    },
    correlation: {},
    health: { enabled: true },
    response: { errorHandler: true },
  });

  await app.listen(3009);
  console.log(
    'Campaign Service listening on :3009 (HTTP) and :5009 (gRPC)',
  );
}

bootstrap();
