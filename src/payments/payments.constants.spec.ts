import {
  ADMIN_CANCELLABLE_PAYMENT_STATUSES, CUSTOMER_SUBMITTABLE_PAYMENT_STATUSES, PAYMENT_STATUS,
  PAYMENT_TRANSITIONS, REVIEWABLE_PAYMENT_STATUSES, canTransitionPayment,
} from './payments.constants';

describe('Payment state machine', () => {
  it('allows PENDING → PENDING_REVIEW (manual transfer declared)', () => {
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PENDING_REVIEW)).toBe(true);
    expect(CUSTOMER_SUBMITTABLE_PAYMENT_STATUSES).toEqual(['PENDING']);
  });

  it('lets only review decide the outcome of a declared transfer', () => {
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING_REVIEW, PAYMENT_STATUS.SUCCEEDED)).toBe(true);
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING_REVIEW, PAYMENT_STATUS.FAILED)).toBe(true);
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING_REVIEW, PAYMENT_STATUS.CANCELLED)).toBe(true);
    expect(REVIEWABLE_PAYMENT_STATUSES).toEqual(['PENDING_REVIEW']);
  });

  it('never lets a PENDING payment jump straight to SUCCEEDED', () => {
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.SUCCEEDED)).toBe(false);
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED)).toBe(false);
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PENDING)).toBe(false);
  });

  it('keeps PROCESSING transitions intact for a future automated provider', () => {
    expect(canTransitionPayment(PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.SUCCEEDED)).toBe(true);
    expect(canTransitionPayment(PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.FAILED)).toBe(true);
    expect(canTransitionPayment(PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.CANCELLED)).toBe(true);
  });

  it('treats SUCCEEDED, FAILED and CANCELLED as terminal', () => {
    expect(PAYMENT_TRANSITIONS.SUCCEEDED).toEqual([]);
    expect(PAYMENT_TRANSITIONS.FAILED).toEqual([]);
    expect(PAYMENT_TRANSITIONS.CANCELLED).toEqual([]);
    (['PENDING', 'PENDING_REVIEW', 'PROCESSING'] as const).forEach((target) => {
      expect(canTransitionPayment(PAYMENT_STATUS.SUCCEEDED, target)).toBe(false);
      expect(canTransitionPayment(PAYMENT_STATUS.FAILED, target)).toBe(false);
      expect(canTransitionPayment(PAYMENT_STATUS.CANCELLED, target)).toBe(false);
    });
  });

  it('exposes exactly the six lifecycle statuses (no refund states)', () => {
    expect(Object.keys(PAYMENT_TRANSITIONS).sort()).toEqual(
      ['CANCELLED', 'FAILED', 'PENDING', 'PENDING_REVIEW', 'PROCESSING', 'SUCCEEDED'].sort(),
    );
  });

  it('lets an admin cancel a payment awaiting review', () => {
    expect(ADMIN_CANCELLABLE_PAYMENT_STATUSES).toEqual(
      expect.arrayContaining(['PENDING', 'PENDING_REVIEW', 'PROCESSING']),
    );
    expect(ADMIN_CANCELLABLE_PAYMENT_STATUSES).not.toContain('SUCCEEDED');
    expect(ADMIN_CANCELLABLE_PAYMENT_STATUSES).not.toContain('FAILED');
  });
});
