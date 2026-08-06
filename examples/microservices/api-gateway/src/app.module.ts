import { Module } from '@nestjs/common';
import { OrderController } from './order/order.controller';
import { OrderGateway } from './order/order.gateway';
import { ProductController } from './product/product.controller';
import { ProductGateway } from './product/product.gateway';

@Module({
  controllers: [OrderController, ProductController],
  providers: [OrderGateway, ProductGateway],
})
export class AppModule {}
