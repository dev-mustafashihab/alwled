import {
  DASHBOARD_LIMITS, DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS, clampLimit, rangeFilter, resolveRange,
} from './dashboard.constants';

describe('dashboard range + limits', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');

  it('defaults to the last 30 UTC days, aligned to midnight', () => {
    const range = resolveRange(undefined, undefined, now);
    expect(range.toIso).toBe('2026-09-16T12:00:00.000Z');
    // 30 complete UTC days ending today → a daily series has exactly 30 buckets
    expect(range.fromIso).toBe('2026-08-18T00:00:00.000Z');
    expect(range.days).toBe(DEFAULT_RANGE_DAYS);
    expect(range.timezone).toBe('UTC');
  });

  it('applies from inclusive / to exclusive as a filter object', () => {
    const range = resolveRange('2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z', now);
    expect(rangeFilter(range)).toEqual({
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lt: new Date('2026-09-02T00:00:00.000Z'),
    });
    // no 23:59:59.999 boundary anywhere
    expect(JSON.stringify(rangeFilter(range))).not.toContain('999');
  });

  it('derives from from `to` when from is missing, and to=now when to is missing', () => {
    const onlyTo = resolveRange(undefined, '2026-09-10T00:00:00.000Z', now);
    // to is exclusive and already at midnight ⇒ 29 complete days are covered
    expect(onlyTo.fromIso).toBe('2026-08-12T00:00:00.000Z');
    expect(onlyTo.days).toBe(29);
    expect(onlyTo.toIso).toBe('2026-09-10T00:00:00.000Z');
    const onlyFrom = resolveRange('2026-09-15T00:00:00.000Z', undefined, now);
    expect(onlyFrom.toIso).toBe('2026-09-16T12:00:00.000Z');
  });

  it('accepts a single-day window (to exclusive of the next instant)', () => {
    const range = resolveRange('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:01.000Z', now);
    expect(range.days).toBe(1);
  });

  it('rejects an empty or inverted range', () => {
    expect(() => resolveRange('2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z', now)).toThrow(/أصغر من/);
    expect(() => resolveRange('2026-09-03T00:00:00.000Z', '2026-09-02T00:00:00.000Z', now)).toThrow(/أصغر من/);
  });

  it('rejects invalid dates and absurdly large ranges', () => {
    expect(() => resolveRange('not-a-date', undefined, now)).toThrow(/ISO 8601/);
    expect(() => resolveRange(undefined, '2026-13-45', now)).toThrow(/ISO 8601/);
    expect(() => resolveRange('2020-01-01T00:00:00.000Z', '2026-09-16T00:00:00.000Z', now))
      .toThrow(new RegExp(String(MAX_RANGE_DAYS)));
  });

  it('clamps list limits to the bounded maximum', () => {
    expect(clampLimit(undefined)).toBe(DASHBOARD_LIMITS.defaultLimit);
    expect(clampLimit(0)).toBe(DASHBOARD_LIMITS.defaultLimit);
    expect(clampLimit(-5)).toBe(DASHBOARD_LIMITS.defaultLimit);
    expect(clampLimit(1)).toBe(1);
    expect(clampLimit(DASHBOARD_LIMITS.maxLimit)).toBe(DASHBOARD_LIMITS.maxLimit);
    expect(clampLimit(1_000_000)).toBe(DASHBOARD_LIMITS.maxLimit);
  });
});
