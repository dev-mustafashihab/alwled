/**
 * E2E bootstrap (runs before any suite is loaded).
 *
 * The verification throttle is intentionally tight in production (10 / 15 min).
 * The functional suites issue more than that from one IP, so they run with a higher
 * budget — and the dedicated rate-limit assertion verifies the budget is enforced at
 * exactly the configured number.
 */
process.env.RATE_VERIFICATION_START_MAX = process.env.RATE_VERIFICATION_START_MAX ?? '30';
process.env.RATE_VERIFICATION_CANCEL_MAX = process.env.RATE_VERIFICATION_CANCEL_MAX ?? '30';
export {};
