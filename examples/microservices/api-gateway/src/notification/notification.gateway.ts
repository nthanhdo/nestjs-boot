import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface Notification {
  id: string;
  userId: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

interface NotificationList {
  items: Notification[];
  total: number;
}

interface NotificationResponse {
  success: boolean;
}

interface NotificationServiceGrpc {
  getNotifications(data: {
    userId: string;
    page: number;
    limit: number;
  }): Observable<NotificationList>;
  markAsRead(data: { id: string }): Observable<NotificationResponse>;
}

@Injectable()
export class NotificationGateway implements OnModuleInit {
  private notificationService!: NotificationServiceGrpc;

  constructor(
    @Inject('NOTIFICATION_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.notificationService =
      this.client.getService<NotificationServiceGrpc>(
        'NotificationService',
      );
  }

  getNotifications(
    userId: string,
    page = 1,
    limit = 20,
  ): Observable<NotificationList> {
    return this.notificationService.getNotifications({
      userId,
      page,
      limit,
    });
  }

  markAsRead(id: string): Observable<NotificationResponse> {
    return this.notificationService.markAsRead({ id });
  }
}
