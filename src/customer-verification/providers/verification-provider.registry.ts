import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  VERIFICATION_PROVIDER_REGISTRY, VerificationProvider,
} from '../interfaces/verification-provider.interface';
import { configuredVerificationProvider } from '../customer-verification.constants';

/**
 * Single resolution point for verification providers.
 *
 * Configuration is strict: VERIFICATION_PROVIDER must name a REGISTERED provider
 * (default LOG). An unknown value fails loudly at startup instead of silently
 * falling back to another provider — a silent fallback could route a verification
 * to something unintended.
 */
@Injectable()
export class VerificationProviderRegistry {
  private readonly logger = new Logger('VerificationProviderRegistry');
  private readonly selected: VerificationProvider;

  constructor(@Inject(VERIFICATION_PROVIDER_REGISTRY) private readonly providers: VerificationProvider[] = []) {
    const configured = configuredVerificationProvider();
    const found = this.providers.find((p) => p.name.toUpperCase() === configured);
    if (!found) {
      const available = this.providers.map((p) => p.name).join(', ') || '(none)';
      throw new InternalServerErrorException(
        `VERIFICATION_PROVIDER="${configured}" غير معروف — المتاح: ${available}`,
      );
    }
    this.selected = found;
    this.logger.log(`verification provider resolved: ${this.selected.name}`);
  }

  get provider(): VerificationProvider {
    return this.selected;
  }

  get name(): string {
    return this.selected.name;
  }

  /** True only when a non-LOG (real) provider is configured — always false in Stage 9. */
  get isExternal(): boolean {
    return this.selected.name !== 'LOG';
  }
}
