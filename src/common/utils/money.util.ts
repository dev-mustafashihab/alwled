import { Prisma } from '@prisma/client';

/**
 * Single source of truth for money handling.
 * Amounts live as NUMERIC(12,2) in PostgreSQL and are computed with Prisma.Decimal
 * (decimal.js) — never JavaScript floats. API responses always carry strings.
 */
export const money = (value: number | string | Prisma.Decimal): Prisma.Decimal =>
  new Prisma.Decimal(typeof value === 'number' ? value.toFixed(2) : value);

/** Serializes an amount for JSON output ("199.99"). */
export const toMoneyString = (
  value: Prisma.Decimal | number | string | null | undefined,
): string | null => (value === null || value === undefined ? null : new Prisma.Decimal(value).toFixed(2));

/** lineTotal = unitPrice × quantity, exact in decimal space. */
export const multiplyMoney = (unitPrice: Prisma.Decimal, quantity: number): Prisma.Decimal =>
  new Prisma.Decimal(unitPrice).times(quantity);

/** Exact sum of a list of amounts (0 when empty). */
export const sumMoney = (amounts: Array<Prisma.Decimal | null | undefined>): Prisma.Decimal =>
  amounts.reduce<Prisma.Decimal>(
    (acc, value) => (value === null || value === undefined ? acc : acc.plus(value)),
    new Prisma.Decimal(0),
  );

/** true when the amount is strictly positive. */
export const isPositiveMoney = (value: Prisma.Decimal): boolean => value.greaterThan(0);
