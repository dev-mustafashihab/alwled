import { Prisma } from '@prisma/client';
import { isPositiveMoney, money, multiplyMoney, sumMoney, toMoneyString } from './money.util';

describe('money.util', () => {
  it('never uses binary floats for financial math', () => {
    // 0.07 * 3 === 0.21000000000000002 in IEEE-754
    expect(toMoneyString(multiplyMoney(money('0.07'), 3))).toBe('0.21');
    expect(toMoneyString(multiplyMoney(money(199.99), 2))).toBe('399.98');
    expect(toMoneyString(sumMoney([money('0.10'), money('0.20')]))).toBe('0.30');
  });

  it('sums long lists without drift', () => {
    const line = money('19.99');
    const total = sumMoney(Array.from({ length: 100 }, () => line));
    expect(toMoneyString(total)).toBe('1999.00');
  });

  it('normalizes numbers and strings to 2 decimals', () => {
    expect(toMoneyString(money(5))).toBe('5.00');
    expect(toMoneyString(money('5.005'))).toBe('5.01');
    expect(toMoneyString(money(new Prisma.Decimal('1234.5')))).toBe('1234.50');
  });

  it('handles null/undefined output safely', () => {
    expect(toMoneyString(null)).toBeNull();
    expect(toMoneyString(undefined)).toBeNull();
    expect(toMoneyString(sumMoney([]))).toBe('0.00');
  });

  it('exposes a positivity helper for business rules', () => {
    expect(isPositiveMoney(money('0.01'))).toBe(true);
    expect(isPositiveMoney(money(0))).toBe(false);
  });
});
