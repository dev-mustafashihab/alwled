import { registerDecorator, ValidationOptions, isStrongPassword } from 'class-validator';

/** Single source of truth for the password policy (register / change / reset). */
export const PASSWORD_POLICY = {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
} as const;

export const PASSWORD_POLICY_MESSAGE =
  'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حرفاً كبيراً وصغيراً ورقماً ورمزاً خاصاً';

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isStrongPassword(value, PASSWORD_POLICY),
        defaultMessage: (): string =>
          (typeof validationOptions?.message === 'string'
            ? validationOptions.message
            : PASSWORD_POLICY_MESSAGE),
      },
    });
  };
}
