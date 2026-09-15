import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import {
  PAYMENT_PROVIDER_REGISTRY, PaymentProvider, ProviderPaymentRequest, ProviderPaymentResult,
} from '../interfaces/payment-provider.interface';

/**
 * Resolves the provider that owns a payment method.
 *
 * The registry is EMPTY in Stage 7 — on purpose. No fake provider is registered and
 * no call is ever made, so nothing can mark a payment successful without a verified
 * provider response. Stage 8 registers a Sham Cash provider here; no other module
 * (orders, cart, inventory) has to change.
 */
@Injectable()
export class PaymentProviderRegistry {
  constructor(
    @Inject(PAYMENT_PROVIDER_REGISTRY) private readonly providers: PaymentProvider[] = [],
  ) {}

  hasProvider(method: PaymentMethod): boolean {
    return this.providers.some((p) => p.methods.includes(method));
  }

  resolve(method: PaymentMethod): PaymentProvider {
    const provider = this.providers.find((p) => p.methods.includes(method));
    if (!provider) {
      throw new NotImplementedException(
        'لا يوجد مزوّد دفع مربوط بعد — تكامل الدفع يأتي في مرحلة لاحقة',
      );
    }
    return provider;
  }

  /** Guarded entry point for future provider calls (never invoked in Stage 7). */
  async createWithProvider(
    method: PaymentMethod,
    request: ProviderPaymentRequest,
  ): Promise<ProviderPaymentResult> {
    return this.resolve(method).createPayment(request);
  }
}
