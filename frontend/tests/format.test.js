const path = require('path');

const load = (relative) => {
  // fresh module per test file, attached to globalThis like in the browser
  delete require.cache[require.resolve(path.join(__dirname, '..', 'assets', 'js', relative))];
  return require(path.join(__dirname, '..', 'assets', 'js', relative));
};

describe('format — المال والأرقام', () => {
  let F;
  beforeEach(() => {
    F = load('core/format.js');
  });

  it('keeps server precision and never converts money through float math', () => {
    expect(F.money('350.00', 'USD')).toBe('350.00 $');
    expect(F.money('0.10', 'USD')).toBe('0.10 $');
    expect(F.money('0.20', 'USD')).toBe('0.20 $');
    expect(F.money('999999.99', 'USD')).toBe('999999.99 $');
    // 0.1 + 0.2 as floats would be 0.30000000000000004 — string handling avoids it entirely
    expect(F.parseMoney('0.1').amount).toBe('0.10');
    expect(F.parseMoney('0.2').amount).toBe('0.20');
    expect(F.parseMoney('1000000.00').amount).toBe('1000000.00');
  });

  it('normalises decimals and signs without touching digits', () => {
    expect(F.parseMoney('10').amount).toBe('10.00');
    expect(F.parseMoney('10.5').amount).toBe('10.50');
    expect(F.parseMoney('-5.005').amount).toBe('-5.00');
    expect(F.parseMoney('').amount).toBeNull();
    expect(F.parseMoney(null).amount).toBeNull();
    expect(F.money(null, 'USD')).toBe('—');
  });

  it('maps known currencies and falls back to the raw code', () => {
    expect(F.money('12.00', 'SYP')).toBe('12.00 ل.س');
    expect(F.money('12.00', 'EUR')).toBe('12.00 €');
    expect(F.money('12.00', 'XYZ')).toBe('12.00 XYZ');
    expect(F.money('12.00', undefined)).toBe('12.00');
  });

  it('formats dates deterministically and rejects invalid input', () => {
    expect(F.dateTime('2026-09-16T09:35:00Z')).toMatch(/2026/);
    expect(F.dateOnly('2026-09-16T09:35:00Z')).toMatch(/أيلول/);
    expect(F.dateTime('not-a-date')).toBe('—');
    expect(F.dateOnly(null)).toBe('—');
  });

  it('computes relative time against a fixed reference', () => {
    const now = new Date('2026-09-16T12:00:00Z');
    expect(F.relative('2026-09-16T11:59:30Z', now)).toBe('الآن');
    expect(F.relative('2026-09-16T11:30:00Z', now)).toBe('قبل 30 دقيقة');
    expect(F.relative('2026-09-16T09:00:00Z', now)).toBe('قبل 3 ساعة');
    expect(F.relative('2026-09-13T12:00:00Z', now)).toBe('قبل 3 يوم');
    expect(F.relative('2026-01-01T00:00:00Z', now)).toBe('قبل 8 شهر');
    expect(F.relative('2024-01-01T00:00:00Z', now)).toMatch(/2024/);
  });

  it('resolves enum labels with a safe fallback', () => {
    expect(F.enumLabel(F.PAYMENT_STATUS, 'PENDING_REVIEW')).toBe('بانتظار المراجعة');
    expect(F.enumLabel(F.VERIFICATION_STATUS, 'VERIFIED')).toBe('موثَّق');
    expect(F.enumLabel(F.NOTIFICATION_TYPE, 'UNKNOWN_CODE')).toBe('UNKNOWN_CODE');
    expect(F.enumLabel(F.ORDER_STATUS, null)).toBe('—');
    expect(F.enumTone(F.PAYMENT_STATUS, 'FAILED')).toBe('danger');
    expect(F.enumTone(F.PAYMENT_STATUS, 'NOPE')).toBe('neutral');
  });

  it('builds names, initials, short ids and byte sizes', () => {
    expect(F.fullName({ firstName: 'أحمد', lastName: 'حسن' })).toBe('أحمد حسن');
    expect(F.fullName({ phone: '0938045496' })).toBe('0938045496');
    expect(F.initials('أحمد', 'حسن')).toBe('أح');
    expect(F.initials('', '')).toBe('؟');
    expect(F.shortId('cmu3786n70000i7zf85hpxkii', 6)).toBe('cmu378…');
    expect(F.formatBytes(2048)).toBe('2.0 ك.ب');
  });

  it('parses date-range helpers as UTC days', () => {
    expect(F.toDateInput(new Date('2026-09-16T23:30:00Z'))).toBe('2026-09-16');
    expect(F.daysBetweenInput('2026-09-01', '2026-09-16')).toBe(15);
    expect(F.daysBetweenInput('', '2026-09-16')).toBeNull();
  });
});
