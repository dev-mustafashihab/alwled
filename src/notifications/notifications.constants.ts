import { Prisma } from '@prisma/client';

/**
 * Stage 11 — notification constants.
 * Single source of truth for types, recipient policy, dedup keys and limits.
 */

export const NOTIFICATION_TYPE = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  PAYMENT_CREATED: 'PAYMENT_CREATED',
  PAYMENT_SUBMITTED_FOR_REVIEW: 'PAYMENT_SUBMITTED_FOR_REVIEW',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED',
  VERIFICATION_STARTED: 'VERIFICATION_STARTED',
  VERIFICATION_REVIEWED: 'VERIFICATION_REVIEWED',
  VERIFICATION_VERIFIED: 'VERIFICATION_VERIFIED',
  VERIFICATION_REJECTED: 'VERIFICATION_REJECTED',
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  PAYMENT_REVIEW_REQUIRED: 'PAYMENT_REVIEW_REQUIRED',
} as const;

export type NotificationTypeValue = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const NOTIFICATION_TYPES: string[] = Object.values(NOTIFICATION_TYPE);

/**
 * Transactional (customer-facing) types. They are an operational record of the
 * user's own order/payment/verification, so they cannot be switched off —
 * there is no business policy that allows losing them.
 */
export const MANDATORY_NOTIFICATION_TYPES: string[] = [
  NOTIFICATION_TYPE.ORDER_CREATED,
  NOTIFICATION_TYPE.ORDER_CONFIRMED,
  NOTIFICATION_TYPE.ORDER_CANCELLED,
  NOTIFICATION_TYPE.PAYMENT_CREATED,
  NOTIFICATION_TYPE.PAYMENT_SUBMITTED_FOR_REVIEW,
  NOTIFICATION_TYPE.PAYMENT_CONFIRMED,
  NOTIFICATION_TYPE.PAYMENT_REJECTED,
  NOTIFICATION_TYPE.VERIFICATION_STARTED,
  NOTIFICATION_TYPE.VERIFICATION_REVIEWED,
  NOTIFICATION_TYPE.VERIFICATION_VERIFIED,
  NOTIFICATION_TYPE.VERIFICATION_REJECTED,
];

/** Operational staff alerts — informational, therefore switchable. */
export const TOGGLEABLE_NOTIFICATION_TYPES: string[] = [
  NOTIFICATION_TYPE.LOW_STOCK,
  NOTIFICATION_TYPE.OUT_OF_STOCK,
  NOTIFICATION_TYPE.PAYMENT_REVIEW_REQUIRED,
];

/** A missing preference row means enabled (deterministic default). */
export const DEFAULT_IN_APP_ENABLED = true;

export const NOTIFICATION_CHANNELS = ['IN_APP'] as const;
export const OPEN_CHANNELS: string[] = ['IN_APP'];

export const NOTIFICATION_PROVIDER_NAME = 'IN_APP';
/** Unknown value fails startup instead of silently falling back. */
export const configuredNotificationProvider = (): string =>
  (process.env.NOTIFICATION_PROVIDER?.trim() || NOTIFICATION_PROVIDER_NAME).toUpperCase();

export const NOTIFICATION_LIMITS = {
  defaultLimit: 20,
  maxLimit: 50,
  defaultPage: 1,
  /** outbox rows processed per dispatch pass — keeps a pass bounded */
  outboxBatch: 50,
  /** bounded retries; after this the row is FAILED (business is unaffected) */
  maxAttempts: 3,
} as const;

export const NOTIFICATION_SORT_FIELDS = ['createdAt', 'readAt', 'type'] as const;

export const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  channel: true,
  deliveryStatus: true,
  title: true,
  body: true,
  data: true,
  eventKey: true,
  readAt: true,
  deliveredAt: true,
  createdAt: true,
} as const satisfies Prisma.NotificationSelect;

export interface NotificationRow {
  id: string;
  type: string;
  channel: string;
  deliveryStatus: string;
  title: string;
  body: string;
  data: Prisma.JsonValue | null;
  eventKey: string;
  readAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

/**
 * Deterministic event identity — never built from collisions-prone parts.
 * format: <TYPE>:<aggregateType>:<aggregateId>[:<discriminator>]
 */
export const buildEventKey = (
  type: NotificationTypeValue,
  aggregateType: string,
  aggregateId: string | number,
  discriminator?: string | number,
): string =>
  [type, aggregateType, String(aggregateId), ...(discriminator === undefined ? [] : [String(discriminator)])]
    .join(':');
