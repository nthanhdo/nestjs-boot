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
        AUTH_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.AUTH_SERVICE_URL || 'localhost:5001',
            package: 'auth',
            protoPath: join(protoDir, 'auth.proto'),
          },
        },
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
            url: process.env.ORDER_SERVICE_URL || 'localhost:5003',
            package: 'order',
            protoPath: join(protoDir, 'order.proto'),
          },
        },
        NOTIFICATION_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.NOTIFICATION_SERVICE_URL || 'localhost:5004',
            package: 'notification',
            protoPath: join(protoDir, 'notification.proto'),
          },
        },
        FILE_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.FILE_SERVICE_URL || 'localhost:5005',
            package: 'file',
            protoPath: join(protoDir, 'file.proto'),
          },
        },
        SCHEDULER_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.SCHEDULER_SERVICE_URL || 'localhost:5006',
            package: 'scheduler',
            protoPath: join(protoDir, 'scheduler.proto'),
          },
        },
        BLOG_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.BLOG_SERVICE_URL || 'localhost:5007',
            package: 'blog',
            protoPath: join(protoDir, 'blog.proto'),
          },
        },
        FULFILLMENT_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.FULFILLMENT_SERVICE_URL || 'localhost:5008',
            package: 'fulfillment',
            protoPath: join(protoDir, 'fulfillment.proto'),
          },
        },
        CAMPAIGN_SERVICE: {
          transport: 'grpc',
          options: {
            url: process.env.CAMPAIGN_SERVICE_URL || 'localhost:5009',
            package: 'campaign',
            protoPath: join(protoDir, 'campaign.proto'),
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
