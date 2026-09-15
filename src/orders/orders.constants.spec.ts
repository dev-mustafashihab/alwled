import {
  CUSTOMER_CANCELLABLE_STATUSES, ORDER_STATUS, ORDER_TRANSITIONS, canTransition,
} from './orders.constants';

describe('Order state machine', () => {
  it('allows PENDING → CONFIRMED and both cancellation paths', () => {
    expect(canTransition(ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED)).toBe(true);
    expect(canTransition(ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED)).toBe(true);
    expect(canTransition(ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED)).toBe(true);
  });

  it('treats CANCELLED as terminal', () => {
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([]);
    expect(canTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.PENDING)).toBe(false);
    expect(canTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.CONFIRMED)).toBe(false);
    expect(canTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.CANCELLED)).toBe(false);
  });

  it('never moves a confirmed order backwards', () => {
    expect(canTransition(ORDER_STATUS.CONFIRMED, ORDER_STATUS.PENDING)).toBe(false);
  });

  it('restricts customer cancellation to PENDING', () => {
    expect(CUSTOMER_CANCELLABLE_STATUSES).toEqual(['PENDING']);
    expect(CUSTOMER_CANCELLABLE_STATUSES).not.toContain('CONFIRMED');
  });

  it('contains no payment-specific statuses', () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual(['CANCELLED', 'CONFIRMED', 'PENDING']);
  });
});
