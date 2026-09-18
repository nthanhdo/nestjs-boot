import { Module } from '@nestjs/common';
import { PagesModule } from './pages/pages.module';
import { NotificationsModule } from './notifications/notifications.module';

/**
 * AppModule — business logic only.
 *
 * Infrastructure (database, cache, auth, health, logging, content service)
 * is auto-wired by createApp() based on the config in main.ts.
 */
@Module({
  imports: [PagesModule, NotificationsModule],
})
export class AppModule {}
