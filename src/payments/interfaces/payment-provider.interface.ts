import { PaymentMethod, PaymentStatus } from '@prisma/client';

/**
 * Provider-independent contract. Stage 7 ships NO implementation: the registry is
 * empty until a real integration exists (Stage 8 — Sham Cash). Nothing in the core
 * payment domain knows provider API details.
 */
export interface ProviderPaymentRequest {
  paymentId: string;
  orderNumber: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  /** Correlates provider callbacks back to our payment record. */
  reference: string;
}

export interface ProviderPaymentResult {
  /** Provider-side identifier once a real provider has accepted the payment. */
  providerPaymentId: string | null;
  /** Raw provider status mapped onto our domain status by the provider itself. */
  status: PaymentStatus;
  /** Optional provider payload kept OUT of the core model. */
  raw?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  readonly methods: PaymentMethod[];
  createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  verifyPayment(providerPaymentId: string): Promise<ProviderPaymentResult>;
}

export const PAYMENT_PROVIDER_REGISTRY = 'PAYMENT_PROVIDER_REGISTRY';
