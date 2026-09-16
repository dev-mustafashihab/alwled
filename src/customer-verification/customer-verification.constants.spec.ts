import {
  ACTIVE_VERIFICATION_STATUSES, RETRYABLE_VERIFICATION_STATUSES, TERMINAL_VERIFICATION_STATUSES,
  VERIFICATION_STATUS, VERIFICATION_STATUS_VALUES, VERIFICATION_TRANSITIONS,
  canTransitionVerification, configuredVerificationProvider, resolveEffectiveVerificationStatus,
  verificationExpiryFrom, verificationRequestTtlHours, VerificationStatusValue,
} from './customer-verification.constants';

describe('verification constants', () => {
  const statuses = Object.keys(VERIFICATION_TRANSITIONS) as VerificationStatusValue[];

  it('exposes the documented statuses', () => {
    expect(VERIFICATION_STATUS_VALUES).toEqual([
      'NOT_STARTED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED',
    ]);
    expect(statuses.sort()).toEqual([...VERIFICATION_STATUS_VALUES].sort());
  });

  it('allows exactly the documented transitions', () => {
    const allowed: [VerificationStatusValue, VerificationStatusValue][] = [
      ['NOT_STARTED', 'PENDING'],
      ['PENDING', 'IN_REVIEW'], ['PENDING', 'CANCELLED'], ['PENDING', 'EXPIRED'],
      ['IN_REVIEW', 'VERIFIED'], ['IN_REVIEW', 'REJECTED'], ['IN_REVIEW', 'CANCELLED'],
      ['REJECTED', 'PENDING'], ['EXPIRED', 'PENDING'],
    ];
    for (const [from, to] of allowed) {
      expect(`${from}->${to} ok: ${canTransitionVerification(from, to)}`).toBe(`${from}->${to} ok: true`);
    }
    let total = 0;
    for (const from of statuses) total += VERIFICATION_TRANSITIONS[from].length;
    expect(total).toBe(allowed.length);
  });

  it('rejects arbitrary transitions', () => {
    const forbidden: [VerificationStatusValue, VerificationStatusValue][] = [
      ['VERIFIED', 'PENDING'], ['VERIFIED', 'REJECTED'], ['VERIFIED', 'CANCELLED'],
      ['CANCELLED', 'VERIFIED'], ['CANCELLED', 'PENDING'],
      ['IN_REVIEW', 'PENDING'], ['REJECTED', 'VERIFIED'], ['REJECTED', 'IN_REVIEW'],
      ['EXPIRED', 'VERIFIED'], ['NOT_STARTED', 'VERIFIED'], ['NOT_STARTED', 'IN_REVIEW'],
      ['PENDING', 'VERIFIED'], ['PENDING', 'REJECTED'],
    ];
    for (const [from, to] of forbidden) {
      expect(`${from}->${to} ${canTransitionVerification(from, to)}`).toBe(`${from}->${to} false`);
    }
  });

  it('treats VERIFIED and CANCELLED as terminal and REJECTED/EXPIRED as retryable', () => {
    expect(TERMINAL_VERIFICATION_STATUSES).toEqual(['VERIFIED', 'CANCELLED']);
    for (const status of TERMINAL_VERIFICATION_STATUSES) {
      expect(VERIFICATION_TRANSITIONS[status]).toEqual([]);
    }
    expect(RETRYABLE_VERIFICATION_STATUSES).toEqual(['REJECTED', 'EXPIRED']);
    for (const status of RETRYABLE_VERIFICATION_STATUSES) {
      expect(VERIFICATION_TRANSITIONS[status]).toEqual(['PENDING']);
    }
    expect(ACTIVE_VERIFICATION_STATUSES).toEqual(['PENDING', 'IN_REVIEW']);
  });

  describe('lazy expiry', () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);

    it('reports an active row past its deadline as EXPIRED', () => {
      expect(resolveEffectiveVerificationStatus('PENDING', past)).toBe('EXPIRED');
      expect(resolveEffectiveVerificationStatus('IN_REVIEW', past)).toBe('EXPIRED');
      expect(resolveEffectiveVerificationStatus('PENDING', future)).toBe('PENDING');
    });

    it('never rewrites a finished row', () => {
      expect(resolveEffectiveVerificationStatus('VERIFIED', past)).toBe('VERIFIED');
      expect(resolveEffectiveVerificationStatus('REJECTED', past)).toBe('REJECTED');
      expect(resolveEffectiveVerificationStatus('CANCELLED', past)).toBe('CANCELLED');
      expect(resolveEffectiveVerificationStatus('EXPIRED', past)).toBe('EXPIRED');
    });

    it('keeps an active row active when no deadline is stored', () => {
      expect(resolveEffectiveVerificationStatus('PENDING', null)).toBe('PENDING');
      expect(resolveEffectiveVerificationStatus('IN_REVIEW', null)).toBe('IN_REVIEW');
    });
  });

  it('defaults the TTL to 72h and honours the environment override', () => {
    delete process.env.VERIFICATION_REQUEST_TTL_HOURS;
    expect(verificationRequestTtlHours()).toBe(72);
    process.env.VERIFICATION_REQUEST_TTL_HOURS = '5';
    expect(verificationRequestTtlHours()).toBe(5);
    process.env.VERIFICATION_REQUEST_TTL_HOURS = 'not-a-number';
    expect(verificationRequestTtlHours()).toBe(72);
    delete process.env.VERIFICATION_REQUEST_TTL_HOURS;

    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(verificationExpiryFrom(from).toISOString()).toBe('2026-01-04T00:00:00.000Z');
  });

  it('defaults the provider to LOG and never falls back silently', () => {
    delete process.env.VERIFICATION_PROVIDER;
    expect(configuredVerificationProvider()).toBe('LOG');
    process.env.VERIFICATION_PROVIDER = 'log';
    expect(configuredVerificationProvider()).toBe('LOG');
    process.env.VERIFICATION_PROVIDER = '  REAL  ';
    expect(configuredVerificationProvider()).toBe('REAL');
    delete process.env.VERIFICATION_PROVIDER;
  });
});
