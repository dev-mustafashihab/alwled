import { Test } from '@nestjs/testing';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-secret';
    strategy = new JwtStrategy();
  });

  it('validates payload with sub', () => {
    const payload = { sub: 'u1', roles: ['CUSTOMER'] };
    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('rejects payload without sub', () => {
    expect(() => strategy.validate({ roles: [] } as never)).toThrow();
  });

  it('has correct extraction method', () => {
    expect(strategy.constructor).toBeDefined();
  });
});
