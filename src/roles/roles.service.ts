import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { ListRolesQueryDto } from './dto/list-roles.query.dto';
import { ActorAccess, assertCanGrantPermissions, hasWildcard, isOwner } from '../common/utils/permissions.util';
import { OWNER_ONLY_ROLE_NAMES, RESERVED_ROLE_NAMES, SystemRole } from '../common/roles.constants';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------- Reads ------------------------------- */

  async list(query: ListRolesQueryDto) {
    const { page, limit, search, isSystem, sortBy, sortOrder } = query;
    const where: Prisma.RoleWhereInput = {};
    if (search?.trim()) where.name = { contains: search.trim(), mode: 'insensitive' };
    if (typeof isSystem === 'boolean') where.isSystem = isSystem;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.role.count({ where }),
      this.prisma.role.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, name: true, description: true, isSystem: true,
          createdAt: true, updatedAt: true,
          _count: { select: { users: true, permissions: true } },
          permissions: {
            select: { permission: { select: { id: true, key: true, group: true } } },
          },
        },
      }),
    ]);

    return {
      items: rows.map((r) => this.serialize(r)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findOne(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true, isSystem: true,
        createdAt: true, updatedAt: true,
        _count: { select: { users: true, permissions: true } },
        permissions: {
          select: { permission: { select: { id: true, key: true, group: true, name: true } } },
        },
      },
    });
    if (!role) throw new NotFoundException('الدور غير موجود');
    return this.serialize(role);
  }

  private serialize(role: {
    id: number; name: string; description: string | null; isSystem: boolean;
    createdAt: Date; updatedAt: Date;
    _count: { users: number; permissions: number };
    permissions: Array<{ permission: { id: number; key: string; group: string; name?: string } }>;
  }) {
    const permissions = role.permissions.map((p) => p.permission);
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystemRole: role.isSystem,
      isOwnerRole: role.name === SystemRole.OWNER,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      assignedUsersCount: role._count.users,
      permissionsCount: role._count.permissions,
      isWildcard: permissions.some((p) => p.key === '*'),
      permissions,
    };
  }

  /* ------------------------------ Mutations ---------------------------- */

  async create(dto: CreateRoleDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const name = dto.name.trim().toUpperCase();
    if (RESERVED_ROLE_NAMES.includes(name)) {
      throw new ConflictException('هذا الاسم محجوز لأدوار النظام');
    }
    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) throw new ConflictException('الدور موجود مسبقاً');

    const permissionIds = dto.permissionIds ?? [];
    const permissions = permissionIds.length
      ? await this.prisma.permission.findMany({ where: { id: { in: permissionIds } } })
      : [];
    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException('بعض الصلاحيات غير موجودة');
    }
    assertCanGrantPermissions(actor, permissions.map((p) => p.key), 'إنشاء دور');

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: { name, description: dto.description ?? null, isSystem: false },
      });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: created.id, permissionId: p.id })),
        });
      }
      return created;
    });

    await this.audit.log({
      action: AUDIT.ROLE_CREATED,
      actorId: actor.id,
      entity: 'role',
      entityId: String(role.id),
      metadata: { name, permissionIds },
      ...meta,
    });

    return this.findOne(role.id);
  }

  async update(id: number, dto: UpdateRoleDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (role.name === SystemRole.OWNER) {
      throw new ForbiddenException('لا يمكن تعديل دور المالك');
    }
    if (role.isSystem && !isOwner(actor)) {
      throw new ForbiddenException('تعديل أدوار النظام متاح للمالك فقط');
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: { description: dto.description ?? role.description },
    });

    await this.audit.log({
      action: AUDIT.ROLE_UPDATED,
      actorId: actor.id,
      entity: 'role',
      entityId: String(id),
      metadata: { name: updated.name, changes: Object.keys(dto) },
      ...meta,
    });
    return this.findOne(id);
  }

  async remove(id: number, actor: ActorAccess, meta: RequestMeta = {}) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { id: true, name: true, isSystem: true, _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (role.isSystem) throw new ForbiddenException('لا يمكن حذف أدوار النظام');
    if (role.name === SystemRole.OWNER) throw new ForbiddenException('لا يمكن حذف دور المالك');
    if (role._count.users > 0) {
      throw new ConflictException('لا يمكن حذف دور مُسند لمستخدمين — أزل الإسناد أولاً');
    }

    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({
      action: AUDIT.ROLE_DELETED,
      actorId: actor.id,
      entity: 'role',
      entityId: String(id),
      metadata: { name: role.name },
      ...meta,
    });
    return { deleted: true, id };
  }

  /** Replaces a role's permission set atomically. */
  async setPermissions(
    id: number,
    dto: SetRolePermissionsDto,
    actor: ActorAccess,
    meta: RequestMeta = {},
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true, name: true, isSystem: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
    if (!role) throw new NotFoundException('الدور غير موجود');

    if (role.name === SystemRole.OWNER) {
      throw new ForbiddenException('صلاحيات دور المالك غير قابلة للتعديل');
    }
    if (role.isSystem) {
      if (!isOwner(actor)) throw new ForbiddenException('تعديل أدوار النظام متاح للمالك فقط');
      if (role.name === SystemRole.ADMIN && !dto.confirmSystemRoleChange) {
        throw new BadRequestException('تعديل صلاحيات دور ADMIN يتطلب تأكيداً صريحاً');
      }
    } else if (!hasWildcard(actor) && !isOwner(actor)) {
      // Custom role: the actor must hold every permission they are granting.
      const currentKeys = role.permissions.map((p) => p.permission.key);
      const actorPerms = new Set(actor.permissions ?? []);
      const losingControl = currentKeys.filter((k) => !actorPerms.has(k));
      if (losingControl.length) {
        throw new ForbiddenException('لا تملك صلاحية تعديل دور يحوي صلاحيات خارج نطاقك');
      }
    }

    const permissions = dto.permissionIds.length
      ? await this.prisma.permission.findMany({ where: { id: { in: dto.permissionIds } } })
      : [];
    if (permissions.length !== dto.permissionIds.length) {
      throw new BadRequestException('بعض الصلاحيات غير موجودة');
    }
    assertCanGrantPermissions(actor, permissions.map((p) => p.key), 'تعديل صلاحيات الدور');

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }
    });

    await this.audit.log({
      action: AUDIT.ROLE_PERMISSIONS_UPDATED,
      actorId: actor.id,
      entity: 'role',
      entityId: String(id),
      metadata: {
        role: role.name,
        permissions: permissions.map((p) => p.key),
      },
      ...meta,
    });

    return this.findOne(id);
  }

  /* --------------------------- Shared helpers --------------------------- */

  /** Loads a role by id or name for employee assignment flows. */
  async resolveRole(idOrName: number | string) {
    const role =
      typeof idOrName === 'number'
        ? await this.prisma.role.findUnique({ where: { id: idOrName } })
        : await this.prisma.role.findUnique({ where: { name: idOrName.toUpperCase() } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    return role;
  }

  /** Roles that only an OWNER may grant/revoke. */
  assertRoleGrantAllowed(actor: ActorAccess, roleName: string, targetIsSelf: boolean) {
    if (targetIsSelf) {
      throw new ForbiddenException('لا يمكنك تعديل أدوارك بنفسك');
    }
    if (OWNER_ONLY_ROLE_NAMES.includes(roleName) && !isOwner(actor)) {
      throw new ForbiddenException('منح/سحب أدوار OWNER وADMIN متاح للمالك فقط');
    }
  }
}
