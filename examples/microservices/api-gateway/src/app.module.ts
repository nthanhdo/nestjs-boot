import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthGateway } from './auth/auth.gateway';
import { OrderController } from './order/order.controller';
import { OrderGateway } from './order/order.gateway';
import { ProductController } from './product/product.controller';
import { ProductGateway } from './product/product.gateway';
import { NotificationController } from './notification/notification.controller';
import { NotificationGateway } from './notification/notification.gateway';

@Module({
  controllers: [
    AuthController,
    OrderController,
    ProductController,
    NotificationController,
  ],
  providers: [AuthGateway, OrderGateway, ProductGateway, NotificationGateway],
})
export class AppModule {}
