/**
 * Stage 10 — Dashboard & Analytics constants.
 *
 * Everything here is read-only: these endpoints never mutate a domain.
 * The single source of truth for date ranges, limits and sortable fields is this file.
 */

/** All timestamps are stored as UTC (timestamp without time zone). */
export const DASHBOARD_TIMEZONE = 'UTC';

/** Default range when the caller sends no from/to. */
export const DEFAULT_RANGE_DAYS = 30;

/** Rejected with 400 beyond this — keeps aggregations bounded. */
export const MAX_RANGE_DAYS = 366;

export const DASHBOARD_LIMITS = {
  defaultLimit: 10,
  /** Bounded: no unbounded list can be requested from the dashboard. */
  maxLimit: 50,
  defaultPage: 1,
  /** Low-stock list inside the inventory analytics payload. */
  lowStockSample: 10,
  /** Top N groups returned for category/brand breakdowns. */
  topGroups: 10,
} as const;

/** Whitelisted sort fields per list endpoint — user input never reaches SQL raw. */
export const DASHBOARD_SORT_FIELDS = {
  recentOrders: ['createdAt', 'total', 'status', 'orderNumber'] as const,
  recentPayments: ['createdAt', 'amount', 'status', 'submittedAt'] as const,
  paymentReview: ['submittedAt', 'amount', 'createdAt'] as const,
};

export const TIMESERIES_GRANULARITIES = ['day', 'week', 'month'] as const;
export type TimeseriesGranularity = (typeof TIMESERIES_GRANULARITIES)[number];

export interface ResolvedRange {
  from: Date;
  to: Date;
  fromIso: string;
  toIso: string;
  timezone: string;
  days: number;
}

export class DashboardRangeError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the day containing `date` — the default window aligns to it. */
export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Central date-range resolution (one helper for every endpoint).
 *
 * Semantics, documented in Swagger:
 *  - ISO 8601 input; `from` inclusive, `to` exclusive (createdAt >= from AND createdAt < to)
 *    so no 23:59:59.999 rounding games are needed;
 *  - default: the last DEFAULT_RANGE_DAYS days, ending now;
 *  - a missing `to` means "until now"; a missing `from` means "to − DEFAULT_RANGE_DAYS";
 *  - all boundaries are UTC;
 *  - `from` must be strictly before `to`, and the range may not exceed MAX_RANGE_DAYS.
 */
export const resolveRange = (fromIso?: string, toIso?: string, now: Date = new Date()): ResolvedRange => {
  const parse = (value: string | undefined, label: string): Date | null => {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new DashboardRangeError(`${label} ليس تاريخاً صالحاً (ISO 8601 مطلوب)`);
    return date;
  };

  const parsedTo = parse(toIso, 'to');
  const parsedFrom = parse(fromIso, 'from');

  const to = parsedTo ?? now;
  // Default window: exactly DEFAULT_RANGE_DAYS complete UTC days, aligned to midnight,
  // so a daily series yields DEFAULT_RANGE_DAYS buckets (no partial leading bucket).
  const from = parsedFrom ?? startOfUtcDay(new Date(to.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS));

  if (from.getTime() >= to.getTime()) {
    throw new DashboardRangeError('from يجب أن يكون أصغر من to (المدى فاضي)');
  }

  const spanDays = (to.getTime() - from.getTime()) / DAY_MS;
  if (spanDays > MAX_RANGE_DAYS) {
    throw new DashboardRangeError(`المدى الأقصى المسموح ${MAX_RANGE_DAYS} يوماً`);
  }

  return {
    from,
    to,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    timezone: DASHBOARD_TIMEZONE,
    days: Math.max(1, Math.ceil(spanDays)),
  };
};

/** The range filter used by every aggregation: from inclusive, to exclusive. */
export const rangeFilter = (range: ResolvedRange) => ({ gte: range.from, lt: range.to });

/** Number of query params that must stay bounded. */
export const clampLimit = (limit: number | undefined): number => {
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return DASHBOARD_LIMITS.defaultLimit;
  return Math.min(Math.floor(value), DASHBOARD_LIMITS.maxLimit);
};
