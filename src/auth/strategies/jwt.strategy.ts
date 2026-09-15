import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ActorService } from '../../common/services/actor.service';

/**
 * Validates the access token AND re-checks the live account on every request:
 * disabled/deleted accounts stop working immediately, and role/permission
 * changes apply without waiting for token expiry.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly actors: ActorService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub) throw new UnauthorizedException('جلسة غير صالحة');

    const actor = await this.actors.resolve(payload.sub);
    if (!actor) throw new UnauthorizedException('جلسة غير صالحة');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('الحساب غير مفعّل');

    return { sub: actor.id, roles: actor.roles, permissions: actor.permissions };
  }
}
