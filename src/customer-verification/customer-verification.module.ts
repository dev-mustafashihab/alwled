import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { VerificationController } from './verification.controller';
import { AdminVerificationsController } from './admin-verifications.controller';
import { CustomerVerificationService } from './customer-verification.service';
import { VerificationProviderRegistry } from './providers/verification-provider.registry';
import { LogCustomerVerificationProvider } from './providers/log-verification.provider';
import { VERIFICATION_PROVIDER_REGISTRY } from './interfaces/verification-provider.interface';

/**
 * Stage 9 registers the internal LOG provider only: it makes no network call and
 * cannot mark a customer VERIFIED. A real provider is added later by appending it
 * to this array and setting VERIFICATION_PROVIDER — no other module changes.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [VerificationController, AdminVerificationsController],
  providers: [
    CustomerVerificationService,
    VerificationProviderRegistry,
    LogCustomerVerificationProvider,
    {
      provide: VERIFICATION_PROVIDER_REGISTRY,
      useFactory: (log: LogCustomerVerificationProvider) => [log],
      inject: [LogCustomerVerificationProvider],
    },
  ],
  exports: [CustomerVerificationService, VerificationProviderRegistry],
})
export class CustomerVerificationModule {}
