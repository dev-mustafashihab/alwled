import { VerificationStatusValue } from '../customer-verification.constants';

/**
 * Provider-independent contract for identity verification.
 * The domain never imports an HTTP client, SDK, credential or provider detail —
 * a real integration (Stage 10+) only has to implement this interface.
 */
export interface VerificationProviderRequest {
  verificationId: string;
  userId: string;
  attempt: number;
  /** Locale hint only — no personal data is sent to any provider in Stage 9. */
  locale?: string;
}

export interface VerificationProviderStatus {
  /** Opaque provider-side reference (never client-supplied). */
  providerReference: string | null;
  /** Provider-reported state, mapped onto our own machine by the provider itself. */
  status: VerificationStatusValue;
  /** Optional provider metadata that must stay free of secrets and documents. */
  meta?: Record<string, string | number | boolean | null>;
}

export interface VerificationProvider {
  readonly name: string;
  startVerification(request: VerificationProviderRequest): Promise<VerificationProviderStatus>;
  getVerificationStatus(providerReference: string): Promise<VerificationProviderStatus>;
  cancelVerification(providerReference: string): Promise<VerificationProviderStatus>;
}

export const VERIFICATION_PROVIDER_REGISTRY = 'VERIFICATION_PROVIDER_REGISTRY';
