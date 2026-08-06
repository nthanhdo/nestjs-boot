import { createApp } from 'nestjs-boot';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const protoDir = join(__dirname, '..', '..', 'proto');

  const app = await createApp(AppModule, {
    database: {
      connections: {
        master: {
          writerUri: process.env.MONGO_URI || 'mongodb://localhost:27017/files',
        },
      },
    },
    transport: {
      grpc: {
        url: '0.0.0.0:5005',
        package: 'file',
        protoPath: join(protoDir, 'file.proto'),
      },
    },
    correlation: {},
    health: { enabled: true },
    response: { errorHandler: true },
  });

  await app.listen(3005);
  console.log('File Service listening on :3005 (HTTP) and :5005 (gRPC)');
}

bootstrap();
