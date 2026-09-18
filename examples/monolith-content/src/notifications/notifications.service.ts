import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * NotificationsService — reacts to content events.
 *
 * In a real app, this would subscribe to ContentEvents and send
 * Slack/email/push notifications when content is published.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  onModuleInit() {
    this.logger.log('Notifications service ready — listening for content events');
  }

  async notifyContentPublished(entrySlug: string, contentType: string) {
    this.logger.log(`Content published: [${contentType}] ${entrySlug}`);
    // TODO: integrate Slack, email, or push notifications
  }
}
