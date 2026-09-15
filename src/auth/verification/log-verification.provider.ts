import { Injectable, Logger } from '@nestjs/common';
import { VerificationChannel } from '@prisma/client';
import { VerificationMessage, VerificationProvider } from './verification-provider.interface';

/**
 * Development/default provider: no external service is contacted.
 * The code is never logged in production; in dev it is logged to ease testing.
 */
@Injectable()
export class LogVerificationProvider implements VerificationProvider {
  readonly channel = VerificationChannel.OTP;
  private readonly logger = new Logger('VerificationProvider');

  async send(message: VerificationMessage): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      this.logger.log(
        `verification queued for user=${message.userId} channel=${message.channel} (no provider configured)`,
      );
      return;
    }
    this.logger.debug(
      `[dev] verification code for user=${message.userId} -> ${message.token} (expires ${message.expiresAt.toISOString()})`,
    );
  }
}
