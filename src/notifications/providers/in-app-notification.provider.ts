import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationDeliveryInput, NotificationDeliveryResult, NotificationProvider,
} from '../interfaces/notification-provider.interface';
import { NOTIFICATION_PROVIDER_NAME, OPEN_CHANNELS } from '../notifications.constants';

/**
 * In-app (log) provider — the ONLY provider registered in Stage 11.
 *
 * Delivery = the notification row is persisted and reachable in the user's inbox.
 * It performs no HTTP call, sends no e-mail/SMS/push, needs no API key, and never
 * reports a delivery it did not cause (no invented providerReference).
 */
@Injectable()
export class InAppNotificationProvider implements NotificationProvider {
  readonly name = NOTIFICATION_PROVIDER_NAME;
  readonly channel = OPEN_CHANNELS[0];
  private readonly logger = new Logger('NotificationProvider:IN_APP');

  async deliver(input: NotificationDeliveryInput): Promise<NotificationDeliveryResult> {
    this.logger.log(
      `in-app delivery notificationId=${input.notificationId} type=${input.type} userId=${input.userId}`,
    );
    return {
      delivered: true,
      // IN_APP has no external counterpart, so no reference is fabricated.
      providerReference: null,
    };
  }
}
