import { isStrongPassword } from 'class-validator';
import { PASSWORD_POLICY } from './password.validator';

const valid = (value: string) => isStrongPassword(value, PASSWORD_POLICY);

describe('password policy', () => {
  it('accepts a compliant password', () => {
    expect(valid('Str0ng!Pass1')).toBe(true);
  });

  it.each([
    ['too short', 'Ab1!c'],
    ['no uppercase', 'str0ng!pass'],
    ['no lowercase', 'STR0NG!PASS'],
    ['no digit', 'Strong!Pass'],
    ['no symbol', 'StrongPass1'],
  ])('rejects %s', (_label, value) => {
    expect(valid(value)).toBe(false);
  });
});
