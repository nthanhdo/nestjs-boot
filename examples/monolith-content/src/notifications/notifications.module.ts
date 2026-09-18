import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * NotificationsModule — example second business module.
 *
 * Listens to content webhooks and sends notifications
 * when content is published.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
