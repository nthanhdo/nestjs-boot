import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Get()
  getNotifications(
    @Query('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationGateway.getNotifications(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationGateway.markAsRead(id);
  }
}
