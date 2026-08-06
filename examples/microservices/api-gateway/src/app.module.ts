import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthGateway } from './auth/auth.gateway';
import { OrderController } from './order/order.controller';
import { OrderGateway } from './order/order.gateway';
import { ProductController } from './product/product.controller';
import { ProductGateway } from './product/product.gateway';
import { NotificationController } from './notification/notification.controller';
import { NotificationGateway } from './notification/notification.gateway';
import { FileController } from './file/file.controller';
import { FileGateway } from './file/file.gateway';
import { SchedulerController } from './scheduler/scheduler.controller';
import { SchedulerGateway } from './scheduler/scheduler.gateway';
import { BlogController } from './blog/blog.controller';
import { BlogGateway } from './blog/blog.gateway';
import { FulfillmentController } from './fulfillment/fulfillment.controller';
import { FulfillmentGateway } from './fulfillment/fulfillment.gateway';
import { CampaignController } from './campaign/campaign.controller';
import { CampaignGateway } from './campaign/campaign.gateway';

@Module({
  controllers: [
    AuthController,
    OrderController,
    ProductController,
    NotificationController,
    FileController,
    SchedulerController,
    BlogController,
    FulfillmentController,
    CampaignController,
  ],
  providers: [AuthGateway, OrderGateway, ProductGateway, NotificationGateway, FileGateway, SchedulerGateway, BlogGateway, FulfillmentGateway, CampaignGateway],
})
export class AppModule {}
