import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface ResolvedActor {
  id: string;
  status: string;
  isVerified: boolean;
  roles: string[];
  permissions: string[];
}

/**
 * Single source of truth for "who is calling and what may they do".
 * Used by JwtStrategy (required auth) and OptionalAuthGuard (public routes that
 * behave differently for staff). Permissions are read live from the DB, so
 * role/permission changes apply to the next request without re-login.
 */
@Injectable()
export class ActorService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string): Promise<ResolvedActor | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        isVerified: true,
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
    if (!user) return null;

    const roles = user.roles.map((r) => r.role.name);
    const permissions = new Set<string>();
    user.roles.forEach((r) =>
      r.role.permissions.forEach((p) => permissions.add(p.permission.key)),
    );
    if (roles.includes('OWNER')) permissions.add('*');

    return {
      id: user.id,
      status: user.status,
      isVerified: user.isVerified,
      roles,
      permissions: Array.from(permissions),
    };
  }
}
