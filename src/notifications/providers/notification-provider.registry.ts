import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PROVIDER_REGISTRY, NotificationProvider,
} from '../interfaces/notification-provider.interface';
import { configuredNotificationProvider } from '../notifications.constants';

/**
 * Single resolution point for notification providers.
 * Configuration is strict: an unknown NOTIFICATION_PROVIDER fails startup rather
 * than silently falling back to another provider.
 */
@Injectable()
export class NotificationProviderRegistry {
  private readonly logger = new Logger('NotificationProviderRegistry');
  private readonly selected: NotificationProvider;

  constructor(
    @Inject(NOTIFICATION_PROVIDER_REGISTRY) private readonly providers: NotificationProvider[] = [],
  ) {
    const configured = configuredNotificationProvider();
    const found = this.providers.find((p) => p.name.toUpperCase() === configured);
    if (!found) {
      const available = this.providers.map((p) => p.name).join(', ') || '(none)';
      throw new InternalServerErrorException(
        `NOTIFICATION_PROVIDER="${configured}" غير معروف — المتاح: ${available}`,
      );
    }
    this.selected = found;
    this.logger.log(`notification provider resolved: ${this.selected.name}`);
  }

  get provider(): NotificationProvider {
    return this.selected;
  }

  get name(): string {
    return this.selected.name;
  }

  /** true only when a non-in-app (external) provider is configured — always false in Stage 11 */
  get isExternal(): boolean {
    return this.selected.name !== 'IN_APP';
  }
}
