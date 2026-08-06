import { createApp } from 'nestjs-boot';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const protoDir = join(__dirname, '..', '..', 'proto');

  const app = await createApp(AppModule, {
    database: {
      connections: {
        master: {
          writerUri: process.env.MONGO_URI || 'mongodb://localhost:27017/auth',
        },
      },
    },
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
        signOptions: { expiresIn: '15m' },
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
        refreshExpiresIn: '7d',
      },
    },
    transport: {
      grpc: {
        url: '0.0.0.0:5000',
        package: 'auth',
        protoPath: join(protoDir, 'auth.proto'),
      },
    },
    correlation: {},
    health: { enabled: true },
    response: { errorHandler: true },
  });

  await app.listen(3003);
  console.log('Auth Service listening on :3003 (HTTP) and :5000 (gRPC)');
}

bootstrap();
