import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { NotificationService } from './notification.service';

interface GetNotificationsRequest {
  userId: string;
  page: number;
  limit: number;
}

interface MarkAsReadRequest {
  id: string;
}

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @GrpcMethod('NotificationService', 'GetNotifications')
  async getNotifications(data: GetNotificationsRequest) {
    return this.notificationService.getNotifications(
      data.userId,
      data.page,
      data.limit,
    );
  }

  @GrpcMethod('NotificationService', 'MarkAsRead')
  async markAsRead(data: MarkAsReadRequest) {
    return this.notificationService.markAsRead(data.id);
  }
}
