import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

/**
 * Validates the access token AND re-checks the live account on every request:
 * disabled/deleted accounts stop working immediately, and role/permission
 * changes apply without waiting for token expiry.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub) throw new UnauthorizedException('جلسة غير صالحة');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        status: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('جلسة غير صالحة');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('الحساب غير مفعّل');

    const roles = user.roles.map((r) => r.role.name);
    const permissions = new Set<string>();
    user.roles.forEach((r) =>
      r.role.permissions.forEach((p) => permissions.add(p.permission.key)),
    );
    if (roles.includes('OWNER')) permissions.add('*');

    return { sub: user.id, roles, permissions: Array.from(permissions) };
  }
}
