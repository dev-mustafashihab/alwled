import { VerificationChannel } from '@prisma/client';

export interface VerificationMessage {
  userId: string;
  destination: string | null;
  channel: VerificationChannel;
  token: string;
  expiresAt: Date;
}

/**
 * Delivery abstraction — Stage 2 ships a logging provider only.
 * Later stages plug in SMS / WhatsApp / Email / OTP providers without touching AuthService.
 */
export interface VerificationProvider {
  readonly channel: VerificationChannel;
  send(message: VerificationMessage): Promise<void>;
}

export const VERIFICATION_PROVIDERS = 'VERIFICATION_PROVIDERS';
