import { Prisma } from '@prisma/client';

/**
 * Payment lifecycle.
 * PENDING_REVIEW is the manual Sham Cash step: the customer declared a transfer
 * (reference + proof) and an employee decides the outcome.
 */
export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/** All lifecycle values — used by request validation so status lists can never drift. */
export const PAYMENT_STATUS_VALUES: string[] = Object.values(PAYMENT_STATUS);

/**
 * Payment state machine.
 * PENDING        → PENDING_REVIEW (manual transfer declared) | PROCESSING | CANCELLED
 * PENDING_REVIEW → SUCCEEDED (employee confirmed the transfer) | FAILED (rejected) | CANCELLED
 * PROCESSING     → SUCCEEDED | FAILED | CANCELLED   (future automated provider flow)
 * SUCCEEDED / FAILED / CANCELLED are terminal.
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatusValue, PaymentStatusValue[]> = {
  PENDING: ['PENDING_REVIEW', 'PROCESSING', 'CANCELLED'],
  PENDING_REVIEW: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
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

/** Statuses an administrator may cancel from (SUCCEEDED/FAILED are terminal). */
export const ADMIN_CANCELLABLE_PAYMENT_STATUSES: PaymentStatusValue[] = [
  'PENDING', 'PENDING_REVIEW', 'PROCESSING',
];

/** The customer may declare a manual transfer only while the payment is untouched. */
export const CUSTOMER_SUBMITTABLE_PAYMENT_STATUSES: PaymentStatusValue[] = ['PENDING'];

/** Only a payment awaiting review can be confirmed or rejected. */
export const REVIEWABLE_PAYMENT_STATUSES: PaymentStatusValue[] = ['PENDING_REVIEW'];

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
  transactionReference: true,
  proofUrl: true,
  proofNote: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedBy: true,
  rejectionReason: true,
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
  transactionReference: string | null;
  proofUrl: string | null;
  proofNote: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Manual Sham Cash receiving account shown to the customer.
 * Read from the environment at request time; when unset the API reports
 * `configured: false` instead of inventing data.
 */
export const shamCashAccountConfig = () => ({
  walletNumber: process.env.SHAMCASH_WALLET_NUMBER?.trim() || null,
  accountName: process.env.SHAMCASH_ACCOUNT_NAME?.trim() || null,
  instructions: process.env.SHAMCASH_INSTRUCTIONS?.trim() || null,
  currency: process.env.SHAMCASH_CURRENCY?.trim() || 'USD',
});
