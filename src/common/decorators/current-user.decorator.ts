import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Lean access-token payload: no email/phone/secrets — roles+permissions for guards. */
export interface JwtPayload {
  sub: string;
  roles: string[];
  permissions?: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user?.[data] : request.user;
  },
);
