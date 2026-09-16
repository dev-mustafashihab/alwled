import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { PAYMENT_PROVIDER_REGISTRY } from './interfaces/payment-provider.interface';

/**
 * The provider list is intentionally empty in Stage 7: no provider implementation
 * exists, so no external call can be made. Stage 8 adds a Sham Cash provider to
 * this array — nothing else in the module (or in Orders/Cart/Inventory) changes.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderRegistry,
    { provide: PAYMENT_PROVIDER_REGISTRY, useValue: [] },
  ],
  exports: [PaymentsService, PaymentProviderRegistry],
})
export class PaymentsModule {}
