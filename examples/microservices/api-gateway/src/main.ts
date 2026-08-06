import { createApp } from 'nestjs-boot';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const protoDir = join(__dirname, '..', '..', 'proto');

  const app = await createApp(AppModule, {
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
      },
    },
    correlation: {
      header: 'X-Correlation-Id',
    },
    transport: {
      clients: {
        PRODUCT_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.PRODUCT_SERVICE_URL || 'localhost:5002',
            package: 'product',
            protoPath: join(protoDir, 'product.proto'),
          },
        },
        ORDER_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.ORDER_SERVICE_URL || 'localhost:5001',
            package: 'order',
            protoPath: join(protoDir, 'order.proto'),
          },
        },
      },
    },
    health: { enabled: true },
    response: { envelope: true, errorHandler: true },
  });

  await app.listen(3000);
  console.log('API Gateway listening on http://localhost:3000');
}

bootstrap();
