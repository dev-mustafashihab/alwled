import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ActorService } from '../services/actor.service';
import type { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Runs AFTER the global JwtAuthGuard. On public routes it still tries to read a
 * bearer token: when present and valid, `req.user` is populated so staff can see
 * inactive catalog entries on the same public endpoints. Invalid tokens are
 * ignored (public route stays public) — never throws.
 */
@Injectable()
export class OptionalAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly actors: ActorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) return true;

    const req = context.switchToHttp().getRequest();
    if (req.user) return true;

    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) return true;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-only-secret') as JwtPayload;
      if (!payload?.sub) return true;
      const actor = await this.actors.resolve(payload.sub);
      if (actor && actor.status === 'ACTIVE') {
        req.user = {
          sub: actor.id,
          roles: actor.roles,
          permissions: actor.permissions,
        } satisfies JwtPayload;
      }
    } catch {
      // ignore — public route remains public
    }
    return true;
  }
}
