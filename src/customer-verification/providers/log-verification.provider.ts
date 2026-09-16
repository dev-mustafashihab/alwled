import { Injectable, Logger } from '@nestjs/common';
import {
  VerificationProvider, VerificationProviderRequest, VerificationProviderStatus,
} from '../interfaces/verification-provider.interface';
import {
  LOG_PROVIDER_NAME, VERIFICATION_STATUS, VerificationStatusValue,
} from '../customer-verification.constants';

/**
 * Internal LOG provider — the ONLY provider registered in Stage 9.
 *
 * What it does: writes an operational log line and returns an opaque internal
 * reference. What it deliberately does NOT do:
 *   - no HTTP request of any kind (no client is even injected);
 *   - no SMS / e-mail / KYC service;
 *   - never returns VERIFIED: starting a verification can only produce PENDING.
 *
 * Reachable only through the DI container; it is never exposed as an endpoint and
 * cannot be selected by a client.
 */
@Injectable()
export class LogCustomerVerificationProvider implements VerificationProvider {
  readonly name = LOG_PROVIDER_NAME;
  private readonly logger = new Logger('VerificationProvider:LOG');

  async startVerification(request: VerificationProviderRequest): Promise<VerificationProviderStatus> {
    const providerReference = `LOG-${request.verificationId}-A${request.attempt}`;
    this.logger.log(
      `start verificationId=${request.verificationId} attempt=${request.attempt} -> PENDING (no external call)`,
    );
    return {
      providerReference,
      // A log provider cannot verify anyone: the request simply enters the queue.
      status: VERIFICATION_STATUS.PENDING as VerificationStatusValue,
      meta: { simulated: false, external: false },
    };
  }

  async getVerificationStatus(providerReference: string): Promise<VerificationProviderStatus> {
    this.logger.log(`status check reference=${providerReference} -> PENDING (no external call)`);
    return { providerReference, status: VERIFICATION_STATUS.PENDING as VerificationStatusValue };
  }

  async cancelVerification(providerReference: string): Promise<VerificationProviderStatus> {
    this.logger.log(`cancel reference=${providerReference} -> CANCELLED (no external call)`);
    return { providerReference, status: VERIFICATION_STATUS.CANCELLED as VerificationStatusValue };
  }
}
