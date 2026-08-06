import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { OrderCreatedHandler } from './handlers/order-created.handler';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, OrderCreatedHandler],
})
export class AppModule {}
