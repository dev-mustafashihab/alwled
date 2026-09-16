import { Prisma } from '@prisma/client';

/**
 * Customer verification lifecycle (Stage 9).
 *
 * NOT_STARTED is virtual: it is returned when a user has no record yet and is
 * never persisted. Everything else is stored on CustomerVerification.
 */
export const VERIFICATION_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type VerificationStatusValue = (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];

export const VERIFICATION_STATUS_VALUES: string[] = Object.values(VERIFICATION_STATUS);

/**
 * Explicit state machine.
 * NOT_STARTED → PENDING
 * PENDING     → IN_REVIEW | CANCELLED | EXPIRED
 * IN_REVIEW   → VERIFIED | REJECTED | CANCELLED
 * REJECTED    → PENDING (retry)   EXPIRED → PENDING (retry)
 * VERIFIED / CANCELLED are terminal.
 */
export const VERIFICATION_TRANSITIONS: Record<VerificationStatusValue, VerificationStatusValue[]> = {
  NOT_STARTED: ['PENDING'],
  PENDING: ['IN_REVIEW', 'CANCELLED', 'EXPIRED'],
  IN_REVIEW: ['VERIFIED', 'REJECTED', 'CANCELLED'],
  REJECTED: ['PENDING'],
  EXPIRED: ['PENDING'],
  VERIFIED: [],
  CANCELLED: [],
};

export const canTransitionVerification = (
  from: VerificationStatusValue,
  to: VerificationStatusValue,
): boolean => (VERIFICATION_TRANSITIONS[from] ?? []).includes(to);

/** Statuses that count as "in flight" — at most one per user (DB-enforced). */
export const ACTIVE_VERIFICATION_STATUSES: VerificationStatusValue[] = ['PENDING', 'IN_REVIEW'];

/** Statuses a customer may retry from by starting again. */
export const RETRYABLE_VERIFICATION_STATUSES: VerificationStatusValue[] = ['REJECTED', 'EXPIRED'];

/** Terminal states — nothing leaves them. */
export const TERMINAL_VERIFICATION_STATUSES: VerificationStatusValue[] = ['VERIFIED', 'CANCELLED'];

export const VERIFICATION_SOURCE = {
  MANUAL: 'MANUAL',
  PROVIDER: 'PROVIDER',
  SYSTEM: 'SYSTEM',
} as const;

export const VERIFICATION_SELECT = {
  id: true,
  userId: true,
  status: true,
  provider: true,
  providerReference: true,
  source: true,
  attempt: true,
  startedAt: true,
  submittedAt: true,
  completedAt: true,
  expiresAt: true,
  rejectionReason: true,
  reviewedBy: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CustomerVerificationSelect;

export type VerificationRow = {
  id: string;
  userId: string;
  status: VerificationStatusValue;
  provider: string | null;
  providerReference: string | null;
  source: string;
  attempt: number;
  startedAt: Date;
  submittedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * How long a request may stay active before it is treated as EXPIRED.
 * Expiry is applied lazily by the domain (on read/start), never by a background job.
 */
export const verificationRequestTtlHours = (): number => {
  const raw = Number(process.env.VERIFICATION_REQUEST_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 72;
};

/** Provider selected by configuration. Default LOG: no external call can happen by accident. */
export const configuredVerificationProvider = (): string =>
  (process.env.VERIFICATION_PROVIDER?.trim() || 'LOG').toUpperCase();

export const LOG_PROVIDER_NAME = 'LOG';

export const verificationExpiryFrom = (from: Date = new Date()): Date =>
  new Date(from.getTime() + verificationRequestTtlHours() * 60 * 60 * 1000);

/**
 * Expiry is derived, not assumed: a stored ACTIVE row whose expiresAt has passed
 * is reported (and later persisted) as EXPIRED with a valid transition.
 * Callers must pass the stored status.
 */
export const resolveEffectiveVerificationStatus = (
  status: VerificationStatusValue,
  expiresAt: Date | null,
  now: Date = new Date(),
): VerificationStatusValue => {
  if (!expiresAt) return status;
  if (!ACTIVE_VERIFICATION_STATUSES.includes(status)) return status;
  return expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : status;
};
