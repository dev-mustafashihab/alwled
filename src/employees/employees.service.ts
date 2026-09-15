import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import * as argon from 'argon2';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { SessionService } from '../auth/session.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ListEmployeesQueryDto } from './dto/list-employees.query.dto';
import { ActorAccess, assertCanGrantPermissions, isOwner } from '../common/utils/permissions.util';
import { OWNER_ONLY_ROLE_NAMES, SystemRole } from '../common/roles.constants';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const EMPLOYEE_SELECT = {
  id: true, firstName: true, lastName: true, email: true, phone: true,
  status: true, isVerified: true, lastLoginAt: true, createdAt: true, updatedAt: true,
  roles: { select: { assignedAt: true, role: { select: { id: true, name: true, isSystem: true } } } },
} as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------- helpers ------------------------------- */

  /** An employee is any user holding at least one role other than CUSTOMER. */
  private get staffFilter(): Prisma.UserWhereInput {
    return { roles: { some: { role: { name: { not: SystemRole.CUSTOMER } } } } };
  }

  private serialize(user: {
    roles: Array<{ assignedAt: Date; role: { id: number; name: string; isSystem: boolean } }>;
    status: UserStatus;
  } & Record<string, unknown>) {
    const roles = user.roles.map((r) => r.role.name);
    return {
      ...user,
      roles,
      rolesDetailed: user.roles.map((r) => ({ ...r.role, assignedAt: r.assignedAt })),
      isActive: user.status === 'ACTIVE',
      isStaff: roles.length > 0,
    };
  }

  private async loadTarget(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true, roles: { select: { role: { select: { id: true, name: true } } } } },
    });
    if (!user) throw new NotFoundException('الموظف غير موجود');
    return { ...user, roleNames: user.roles.map((r) => r.role.name) };
  }

  /** Only an OWNER may touch OWNER accounts. */
  private assertTargetManageable(actor: ActorAccess, targetRoles: string[]) {
    if (targetRoles.includes(SystemRole.OWNER) && !isOwner(actor)) {
      throw new ForbiddenException('لا يمكن تعديل حساب المالك إلا من المالك');
    }
  }

  private async countOwners(tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.user.count({
      where: { status: { not: 'DELETED' }, roles: { some: { role: { name: SystemRole.OWNER } } } },
    });
  }

  /**
   * Prevents leaving the system without an OWNER (and without a last owner in general).
   * Must be called with the current owner count already known.
   */
  private assertNotLastOwner(targetRoles: string[], ownersCount: number, action: string) {
    if (targetRoles.includes(SystemRole.OWNER) && ownersCount <= 1) {
      throw new ForbiddenException(`لا يمكن ${action} — هذا آخر حساب مالك في النظام`);
    }
  }

  /* ------------------------------ operations ----------------------------- */

  async create(dto: CreateEmployeeDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const role = dto.roleId
      ? await this.prisma.role.findUniqueOrThrow({ where: { id: dto.roleId } })
      : dto.roleName
        ? await this.prisma.role.findUnique({ where: { name: dto.roleName.toUpperCase() } })
        : await this.prisma.role.findUnique({ where: { name: SystemRole.EMPLOYEE } });

    if (!role) throw new NotFoundException('الدور المطلوب غير موجود');
    if (role.name === SystemRole.OWNER) {
      throw new ForbiddenException('لا يمكن إنشاء حساب مالك من هذا المسار');
    }
    if (OWNER_ONLY_ROLE_NAMES.includes(role.name) && !isOwner(actor)) {
      throw new ForbiddenException('إنشاء حساب ADMIN متاح للمالك فقط');
    }

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permission: { select: { key: true } } },
    });
    assertCanGrantPermissions(
      actor,
      rolePermissions.map((p) => p.permission.key),
      'إنشاء موظف',
    );

    const email = dto.email ? dto.email.toLowerCase().trim() : null;
    const phone = dto.phone.trim();
    const duplicates = await this.prisma.user.findFirst({
      where: { OR: [...(email ? [{ email }] : []), { phone }] },
      select: { email: true, phone: true },
    });
    if (duplicates) {
      if (email && duplicates.email === email) throw new ConflictException('البريد الإلكتروني مستخدم مسبقاً');
      throw new ConflictException('رقم الهاتف مستخدم مسبقاً');
    }

    const passwordHash = await argon.hash(dto.password);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          phone,
          passwordHash,
          roles: { create: [{ roleId: role.id }] },
        },
        select: EMPLOYEE_SELECT,
      });
      return user;
    });

    await this.audit.log({
      action: AUDIT.EMPLOYEE_CREATED,
      actorId: actor.id,
      entity: 'user',
      entityId: created.id,
      metadata: { role: role.name, roleId: role.id },
      ...meta,
    });

    return this.serialize(created as never);
  }

  async list(query: ListEmployeesQueryDto) {
    const { page, limit, search, role, status, isVerified, sortBy, sortOrder } = query;
    const where: Prisma.UserWhereInput = { AND: [this.staffFilter] };

    if (search?.trim()) {
      const term = search.trim();
      (where.AND as Prisma.UserWhereInput[]).push({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
        ],
      });
    }
    if (status) where.status = status;
    if (typeof isVerified === 'boolean') where.isVerified = isVerified;
    if (role) {
      (where.AND as Prisma.UserWhereInput[]).push({
        roles: { some: { role: { name: role.toUpperCase() } } },
      });
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: EMPLOYEE_SELECT,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.serialize(r as never)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: EMPLOYEE_SELECT });
    if (!user) throw new NotFoundException('الموظف غير موجود');
    if (!user.roles.some((r) => r.role.name !== SystemRole.CUSTOMER)) {
      throw new NotFoundException('المستخدم ليس موظفاً');
    }
    const [permissions, activeSessions] = await Promise.all([
      this.effectivePermissions(id),
      this.sessions.countActive(id),
    ]);
    return { ...this.serialize(user as never), effectivePermissions: permissions, activeSessions };
  }

  /** Effective permissions = union of the permissions of all assigned roles. */
  async effectivePermissions(userId: string): Promise<string[]> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } } },
    });
    const perms = new Set<string>();
    let wildcard = false;
    roles.forEach((r) => {
      if (r.role.name === SystemRole.OWNER) wildcard = true;
      r.role.permissions.forEach((p) => perms.add(p.permission.key));
    });
    if (wildcard) perms.add('*');
    return Array.from(perms);
  }

  async update(id: string, dto: UpdateEmployeeDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const target = await this.loadTarget(id);
    this.assertTargetManageable(actor, target.roleNames);

    const data: Prisma.UserUpdateInput = {};
    const changed: string[] = [];
    if (dto.firstName !== undefined) { data.firstName = dto.firstName.trim(); changed.push('firstName'); }
    if (dto.lastName !== undefined) { data.lastName = dto.lastName.trim(); changed.push('lastName'); }

    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      const owner = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (owner && owner.id !== id) throw new ConflictException('رقم الهاتف مستخدم مسبقاً');
      data.phone = phone; changed.push('phone');
    }
    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      const owner = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (owner && owner.id !== id) throw new ConflictException('البريد الإلكتروني مستخدم مسبقاً');
      data.email = email; changed.push('email');
    }
    if (!changed.length) throw new BadRequestException('لا توجد حقول قابلة للتعديل');

    const updated = await this.prisma.user.update({ where: { id }, data, select: EMPLOYEE_SELECT });

    await this.audit.log({
      action: AUDIT.EMPLOYEE_UPDATED,
      actorId: actor.id,
      entity: 'user',
      entityId: id,
      metadata: { changed },
      ...meta,
    });
    return this.serialize(updated as never);
  }

  async setStatus(id: string, isActive: boolean, actor: ActorAccess, meta: RequestMeta = {}) {
    const target = await this.loadTarget(id);
    if (id === actor.id) throw new BadRequestException('لا يمكنك تغيير حالة حسابك');
    this.assertTargetManageable(actor, target.roleNames);

    if (!isActive && target.roleNames.includes(SystemRole.OWNER)) {
      const owners = await this.countOwners();
      this.assertNotLastOwner(target.roleNames, owners, 'تعطيل');
    }

    const status: UserStatus = isActive ? 'ACTIVE' : 'SUSPENDED';
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: EMPLOYEE_SELECT,
    });

    const revoked = isActive ? 0 : await this.sessions.revokeAll(id, 'employee_disabled');

    await this.audit.log({
      action: isActive ? AUDIT.EMPLOYEE_ENABLED : AUDIT.EMPLOYEE_DISABLED,
      actorId: actor.id,
      entity: 'user',
      entityId: id,
      metadata: { revokedSessions: revoked, previousStatus: target.status },
      ...meta,
    });

    return { ...this.serialize(updated as never), revokedSessions: revoked };
  }

  async assignRole(id: string, dto: AssignRoleDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const target = await this.loadTarget(id);
    if (id === actor.id) throw new ForbiddenException('لا يمكنك تعديل أدوارك بنفسك');
    // Only an OWNER may touch an OWNER account.
    this.assertTargetManageable(actor, target.roleNames);

    const role = dto.roleId
      ? await this.prisma.role.findUnique({ where: { id: dto.roleId } })
      : dto.roleName
        ? await this.prisma.role.findUnique({ where: { name: dto.roleName.toUpperCase() } })
        : null;
    if (!role) throw new NotFoundException('الدور المطلوب غير موجود');

    if (target.roleNames.includes(role.name)) {
      throw new ConflictException('الدور مُسند للموظف مسبقاً');
    }
    if (OWNER_ONLY_ROLE_NAMES.includes(role.name) && !isOwner(actor)) {
      throw new ForbiddenException('منح دور OWNER أو ADMIN متاح للمالك فقط');
    }

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permission: { select: { key: true } } },
    });
    assertCanGrantPermissions(actor, rolePermissions.map((p) => p.permission.key), 'إسناد دور');

    await this.prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    await this.audit.log({
      action: AUDIT.ROLE_ASSIGNED,
      actorId: actor.id,
      entity: 'user',
      entityId: id,
      metadata: { role: role.name, roleId: role.id },
      ...meta,
    });

    return this.findOne(id);
  }

  async revokeRole(id: string, roleId: number, actor: ActorAccess, meta: RequestMeta = {}) {
    const target = await this.loadTarget(id);
    if (id === actor.id) throw new ForbiddenException('لا يمكنك تعديل أدوارك بنفسك');
    // Only an OWNER may touch an OWNER account.
    this.assertTargetManageable(actor, target.roleNames);

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (!target.roleNames.includes(role.name)) {
      throw new BadRequestException('الدور غير مُسند لهذا الموظف');
    }
    // Authority checks first (403), then structural integrity (400).
    if (OWNER_ONLY_ROLE_NAMES.includes(role.name) && !isOwner(actor)) {
      throw new ForbiddenException('سحب دور OWNER أو ADMIN متاح للمالك فقط');
    }
    if (role.name === SystemRole.OWNER) {
      const owners = await this.countOwners();
      this.assertNotLastOwner(target.roleNames, owners, 'سحب دور المالك');
    }
    if (target.roleNames.length <= 1) {
      throw new BadRequestException('لا يمكن ترك الحساب بدون أي دور — أسند دوراً بديلاً أولاً');
    }

    await this.prisma.userRole.delete({ where: { userId_roleId: { userId: id, roleId } } });
    await this.audit.log({
      action: AUDIT.ROLE_REVOKED,
      actorId: actor.id,
      entity: 'user',
      entityId: id,
      metadata: { role: role.name, roleId: role.id },
      ...meta,
    });

    return this.findOne(id);
  }
}
