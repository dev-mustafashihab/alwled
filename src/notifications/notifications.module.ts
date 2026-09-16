import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationProviderRegistry } from './providers/notification-provider.registry';
import { InAppNotificationProvider } from './providers/in-app-notification.provider';
import { NOTIFICATION_PROVIDER_REGISTRY } from './interfaces/notification-provider.interface';

/**
 * Stage 11 registers the in-app (log) provider only: no e-mail, SMS, WhatsApp or
 * push provider exists, and nothing in this module performs an HTTP call.
 * A real channel is added later by implementing NotificationProvider and adding it
 * to this array together with NOTIFICATION_PROVIDER — no other module changes.
 */
@Module({
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    NotificationsService,
    NotificationProviderRegistry,
    InAppNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDER_REGISTRY,
      useFactory: (inApp: InAppNotificationProvider) => [inApp],
      inject: [InAppNotificationProvider],
    },
  ],
  exports: [NotificationsService, NotificationProviderRegistry],
})
export class NotificationsModule {}
