import { PAYMENT_STATUS, PAYMENT_TRANSITIONS, canTransitionPayment } from './payments.constants';

describe('Payment state machine', () => {
  it('allows exactly the documented transitions', () => {
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PROCESSING)).toBe(true);
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.CANCELLED)).toBe(true);
    expect(canTransitionPayment(PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.SUCCEEDED)).toBe(true);
    expect(canTransitionPayment(PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.FAILED)).toBe(true);
    expect(canTransitionPayment(PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.CANCELLED)).toBe(true);
  });

  it('never leaves a PENDING payment to SUCCEEDED/FAILED without PROCESSING', () => {
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.SUCCEEDED)).toBe(false);
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED)).toBe(false);
    expect(canTransitionPayment(PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PENDING)).toBe(false);
  });

  it('treats SUCCEEDED as terminal', () => {
    expect(PAYMENT_TRANSITIONS.SUCCEEDED).toEqual([]);
    (
      [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.FAILED, PAYMENT_STATUS.CANCELLED] as const
    ).forEach((target) => {
      expect(canTransitionPayment(PAYMENT_STATUS.SUCCEEDED, target)).toBe(false);
    });
  });

  it('treats FAILED and CANCELLED as terminal', () => {
    expect(canTransitionPayment(PAYMENT_STATUS.FAILED, PAYMENT_STATUS.SUCCEEDED)).toBe(false);
    expect(canTransitionPayment(PAYMENT_STATUS.FAILED, PAYMENT_STATUS.PROCESSING)).toBe(false);
    expect(canTransitionPayment(PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.PROCESSING)).toBe(false);
    expect(canTransitionPayment(PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.PENDING)).toBe(false);
  });

  it('contains exactly the five provider-independent statuses (no refund states)', () => {
    expect(Object.keys(PAYMENT_TRANSITIONS).sort()).toEqual(
      ['CANCELLED', 'FAILED', 'PENDING', 'PROCESSING', 'SUCCEEDED'].sort(),
    );
  });
});
