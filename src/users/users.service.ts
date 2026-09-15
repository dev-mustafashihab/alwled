import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { PUBLIC_USER_SELECT } from '../common/constants';
import { SessionService } from '../auth/session.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';

export interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...PUBLIC_USER_SELECT, updatedAt: true },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return { ...user, roles: user.roles.map((r) => r.role.name), isActive: user.status === 'ACTIVE' };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto, meta: { ip?: string; userAgent?: string } = {}) {
    const data: Prisma.UserUpdateInput = {};
    const changed: string[] = [];

    if (dto.firstName !== undefined) { data.firstName = dto.firstName.trim(); changed.push('firstName'); }
    if (dto.lastName !== undefined) { data.lastName = dto.lastName.trim(); changed.push('lastName'); }

    let reverification = false;
    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      const owner = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (owner && owner.id !== userId) throw new ConflictException('رقم الهاتف مستخدم مسبقاً');
      const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, isVerified: true } });
      if (current?.phone !== phone) {
        data.phone = phone;
        changed.push('phone');
        // Changing the identity contact invalidates verification until re-confirmed.
        if (current?.isVerified) { data.isVerified = false; reverification = true; }
      }
    }

    if (!changed.length) throw new BadRequestException('لا توجد حقول قابلة للتعديل');

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { ...PUBLIC_USER_SELECT, updatedAt: true },
    });

    await this.audit.log({
      action: AUDIT.PROFILE_UPDATED,
      actorId: userId,
      entity: 'user',
      entityId: userId,
      metadata: { changed, reverification },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      ...user,
      roles: user.roles.map((r) => r.role.name),
      isActive: user.status === 'ACTIVE',
      requiresReverification: reverification,
    };
  }

  async list(query: ListUsersQueryDto): Promise<Paginated<unknown>> {
    const { page, limit, search, role, status, isVerified, sortBy, sortOrder } = query;
    const where: Prisma.UserWhereInput = {};

    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
      ];
    }
    if (status) where.status = status;
    if (typeof isVerified === 'boolean') where.isVerified = isVerified;
    if (role) where.roles = { some: { role: { name: role } } };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: { ...PUBLIC_USER_SELECT, updatedAt: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((u) => ({
        ...u,
        roles: u.roles.map((r) => r.role.name),
        isActive: u.status === 'ACTIVE',
      })),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async setStatus(
    targetId: string,
    isActive: boolean,
    actor: { id: string; roles: string[] },
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, status: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!target) throw new NotFoundException('المستخدم غير موجود');

    const targetRoles = target.roles.map((r) => r.role.name);
    if (targetId === actor.id) throw new BadRequestException('لا يمكنك تغيير حالة حسابك');
    // Privilege protection: only OWNER may act on OWNER/ADMIN accounts.
    const privileged = targetRoles.some((r) => r === 'OWNER' || r === 'ADMIN');
    if (privileged && !actor.roles.includes('OWNER')) {
      throw new ForbiddenException('لا تملك صلاحية تعديل هذا الحساب');
    }

    const nextStatus: UserStatus = isActive ? 'ACTIVE' : 'SUSPENDED';
    const user = await this.prisma.user.update({
      where: { id: targetId },
      data: { status: nextStatus },
      select: PUBLIC_USER_SELECT,
    });

    let revoked = 0;
    if (!isActive) revoked = await this.sessions.revokeAll(targetId, 'account_disabled');

    await this.audit.log({
      action: isActive ? AUDIT.USER_ENABLED : AUDIT.USER_DISABLED,
      actorId: actor.id,
      entity: 'user',
      entityId: targetId,
      metadata: { revokedSessions: revoked, previousStatus: target.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      ...user,
      roles: user.roles.map((r) => r.role.name),
      isActive: user.status === 'ACTIVE',
      revokedSessions: revoked,
    };
  }
}
