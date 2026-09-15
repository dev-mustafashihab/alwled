import { Prisma } from '@prisma/client';

/** Stage 7 keeps a payment-agnostic lifecycle: no refund or provider-specific states. */
export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/**
 * Payment state machine.
 * PENDING  → PROCESSING | CANCELLED
 * PROCESSING → SUCCEEDED | FAILED | CANCELLED
 * SUCCEEDED / FAILED / CANCELLED are terminal.
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatusValue, PaymentStatusValue[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export const canTransitionPayment = (from: PaymentStatusValue, to: PaymentStatusValue): boolean =>
  (PAYMENT_TRANSITIONS[from] ?? []).includes(to);

/** Methods usable in this stage. Other enum values are reserved for later stages. */
export const SUPPORTED_PAYMENT_METHODS = ['SHAM_CASH'] as const;
export const DEFAULT_PAYMENT_METHOD = 'SHAM_CASH' as const;

/** Order statuses that may receive a payment. Cancelled orders never can. */
export const PAYABLE_ORDER_STATUSES = ['PENDING', 'CONFIRMED'] as const;

/** Statuses an administrator may cancel from (never SUCCEEDED/FAILED). */
export const ADMIN_CANCELLABLE_PAYMENT_STATUSES: PaymentStatusValue[] = ['PENDING', 'PROCESSING'];

export const PAYMENT_SELECT = {
  id: true,
  orderId: true,
  userId: true,
  method: true,
  status: true,
  amount: true,
  currency: true,
  provider: true,
  providerPaymentId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PaymentSelect;

/** Financial values are Decimal in the DB and strings in JSON. */
export type PaymentRow = {
  id: string;
  orderId: number;
  userId: string;
  method: string;
  status: PaymentStatusValue;
  amount: Prisma.Decimal;
  currency: string;
  provider: string | null;
  providerPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
