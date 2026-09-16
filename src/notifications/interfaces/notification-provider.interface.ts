import { Prisma, PrismaClient } from '@prisma/client';

/**
 * A provider receives an already-persisted notification and reports how it was
 * "delivered". In Stage 11 the only provider is IN_APP: delivery means the row
 * exists in the user's inbox (the database). It cannot claim anything else.
 */
export interface NotificationDeliveryInput {
  notificationId: string;
  userId: string;
  type: string;
  channel: string;
  title: string;
  body: string;
}

export interface NotificationDeliveryResult {
  /** true only when the channel the provider owns really received it */
  delivered: boolean;
  /** provider-side reference (IN_APP has none — it stays null, never invented) */
  providerReference: string | null;
  /** safe, user-facing failure reason (no internals/secrets) */
  failureReason?: string;
}

export interface NotificationProvider {
  readonly name: string;
  /** the single channel this provider owns */
  readonly channel: string;
  deliver(input: NotificationDeliveryInput): Promise<NotificationDeliveryResult>;
}

/** Lets a provider persist/verify its own delivery inside the caller's transaction. */
export type NotificationDb = PrismaClient | Prisma.TransactionClient;

export const NOTIFICATION_PROVIDER_REGISTRY = 'NOTIFICATION_PROVIDER_REGISTRY';
