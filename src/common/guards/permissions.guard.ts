import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload, PermissionRequirement, PERMISSIONS_KEY } from '../decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!req) return true; // no permission gate on this route

    const user = context.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user) return false;

    const userPerms = user.permissions ?? [];
    if (userPerms.includes('*')) return true; // OWNER shortcut

    if (req.all?.length) {
      if (!req.all.every((p) => userPerms.includes(p))) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
    if (req.any?.length) {
      if (!req.any.some((p) => userPerms.includes(p))) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
    if (!req.all?.length && !req.any?.length) return true;
    return true;
  }
}
