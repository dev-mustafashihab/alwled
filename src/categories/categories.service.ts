import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';
import { ActorAccess, hasPermission, isOwner } from '../common/utils/permissions.util';
import { slugify, uniqueSlug } from '../common/utils/slug.util';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Root → child → grandchild. Deeper nesting is blocked to keep URLs/UI sane. */
export const CATEGORY_MAX_DEPTH = 3;

const CATEGORY_SELECT = {
  id: true, name: true, slug: true, description: true, image: true,
  parentId: true, isActive: true, sortOrder: true, createdAt: true, updatedAt: true,
  parent: { select: { id: true, name: true, slug: true } },
  _count: { select: { children: true, products: true } },
} as const;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------- helpers ------------------------------- */

  private canSeeInactive(actor?: ActorAccess | null): boolean {
    return !!actor && hasPermission(actor, 'categories.read');
  }

  private serialize(
    row: {
      id?: number;
      parentId?: number | null;
      _count?: { children: number; products: number };
      parent?: { id: number; name: string; slug: string } | null;
    } & Record<string, unknown>,
  ): { id: number; parentId: number | null } & Record<string, unknown> {
    const { _count, ...rest } = row;
    return {
      ...rest,
      id: (row.id ?? 0) as number,
      parentId: (row.parentId ?? null) as number | null,
      childrenCount: _count?.children ?? 0,
      productsCount: _count?.products ?? 0,
      hasChildren: (_count?.children ?? 0) > 0,
    };
  }

  /** Depth of a node = 1 for roots. */
  private async depthOf(id: number): Promise<number> {
    let depth = 1;
    let current = await this.prisma.category.findUnique({
      where: { id },
      select: { parentId: true },
    });
    let guard = 0;
    while (current?.parentId && guard < 10) {
      depth += 1;
      current = await this.prisma.category.findUnique({
        where: { id: current.parentId },
        select: { parentId: true },
      });
      guard += 1;
    }
    return depth;
  }

  private async subtreeHeight(id: number): Promise<number> {
    let height = 1;
    let level = [id];
    let guard = 0;
    while (level.length && guard < 10) {
      const children = await this.prisma.category.findMany({
        where: { parentId: { in: level } },
        select: { id: true },
      });
      if (!children.length) break;
      height += 1;
      level = children.map((c) => c.id);
      guard += 1;
    }
    return height;
  }

  private async assertSlugFree(slug: string, ignoreId?: number) {
    const existing = await this.prisma.category.findUnique({ where: { slug }, select: { id: true } });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('الـslug مستخدم مسبقاً');
    }
  }

  /* ------------------------------- queries ------------------------------- */

  async list(query: ListCategoriesQueryDto, actor?: ActorAccess | null) {
    const { page, limit, search, parentId, rootsOnly, includeInactive, tree, sortBy, sortOrder } = query;
    const showInactive = !!includeInactive && this.canSeeInactive(actor);

    const where: Prisma.CategoryWhereInput = {};
    if (!showInactive) where.isActive = true;
    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (rootsOnly) where.parentId = null;
    else if (parentId !== undefined) where.parentId = parentId === 0 ? null : parentId;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        select: CATEGORY_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = rows.map((r) => this.serialize(r as never));
    return {
      items: tree ? this.buildTree(items) : items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Assembles root → children → grandchildren from a flat page (no extra queries). */
  private buildTree(flat: Array<Record<string, unknown> & { id: number; parentId: number | null }>) {
    const byId = new Map(flat.map((c) => [c.id, { ...c, children: [] as unknown[] }]));
    const roots: unknown[] = [];
    byId.forEach((node) => {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) (parent.children as unknown[]).push(node);
      else roots.push(node);
    });
    return roots;
  }

  async findBySlugOrId(idOrSlug: string, actor?: ActorAccess | null) {
    const numeric = Number(idOrSlug);
    const row = await this.prisma.category.findFirst({
      where: Number.isInteger(numeric) && numeric > 0 ? { id: numeric } : { slug: idOrSlug },
      select: CATEGORY_SELECT,
    });
    if (!row) throw new NotFoundException('التصنيف غير موجود');
    if (!row.isActive && !this.canSeeInactive(actor)) {
      throw new NotFoundException('التصنيف غير موجود');
    }
    const children = await this.prisma.category.findMany({
      where: { parentId: row.id, ...(this.canSeeInactive(actor) ? {} : { isActive: true }) },
      select: { id: true, name: true, slug: true, image: true, sortOrder: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { ...this.serialize(row as never), children };
  }

  /* ------------------------------ mutations ------------------------------ */

  async create(dto: CreateCategoryDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const slug = dto.slug ? slugify(dto.slug) : await uniqueSlug(dto.name, async (c) => !!(await this.prisma.category.findUnique({ where: { slug: c }, select: { id: true } })));
    await this.assertSlugFree(slug);

    let depth = 1;
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
        select: { id: true, isActive: true },
      });
      if (!parent) throw new BadRequestException('التصنيف الأب غير موجود');
      depth = (await this.depthOf(parent.id)) + 1;
      if (depth > CATEGORY_MAX_DEPTH) {
        throw new BadRequestException(`الحد الأقصى لعمق التصنيفات ${CATEGORY_MAX_DEPTH} مستويات`);
      }
      if (!parent.isActive && dto.isActive !== false) {
        throw new BadRequestException('لا يمكن إضافة تصنيف نشط تحت تصنيف أب غير نشط');
      }
    }

    const created = await this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description ?? null,
        image: dto.image ?? null,
        parentId: dto.parentId ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      select: CATEGORY_SELECT,
    });

    await this.audit.log({
      action: AUDIT.CATEGORY_CREATED,
      actorId: actor.id,
      entity: 'category',
      entityId: String(created.id),
      metadata: { slug, parentId: created.parentId },
      ...meta,
    });
    return this.serialize(created as never);
  }

  async update(id: number, dto: UpdateCategoryDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const current = await this.prisma.category.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('التصنيف غير موجود');

    const data: Prisma.CategoryUpdateInput = {};
    const changed: string[] = [];

    if (dto.name !== undefined) { data.name = dto.name.trim(); changed.push('name'); }
    if (dto.description !== undefined) { data.description = dto.description; changed.push('description'); }
    if (dto.image !== undefined) { data.image = dto.image; changed.push('image'); }
    if (dto.sortOrder !== undefined) { data.sortOrder = dto.sortOrder; changed.push('sortOrder'); }
    if (dto.isActive !== undefined) { data.isActive = dto.isActive; changed.push('isActive'); }

    if (dto.slug !== undefined) {
      const slug = slugify(dto.slug);
      await this.assertSlugFree(slug, id);
      data.slug = slug; changed.push('slug');
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        data.parent = { disconnect: true };
        changed.push('parentId');
      } else {
        if (dto.parentId === id) throw new BadRequestException('لا يمكن أن يكون التصنيف أباً لنفسه');
        const parent = await this.prisma.category.findUnique({
          where: { id: dto.parentId },
          select: { id: true },
        });
        if (!parent) throw new BadRequestException('التصنيف الأب غير موجود');
        // Circular protection: the new parent must not be a descendant of this node.
        const descendants = await this.collectDescendants(id);
        if (descendants.has(dto.parentId)) {
          throw new BadRequestException('لا يمكن ربط التصنيف بأحد أبنائه (حلقة دائرية)');
        }
        const newDepth = (await this.depthOf(dto.parentId)) + (await this.subtreeHeight(id)) - 1;
        if (newDepth > CATEGORY_MAX_DEPTH) {
          throw new BadRequestException(`الحد الأقصى لعمق التصنيفات ${CATEGORY_MAX_DEPTH} مستويات`);
        }
        data.parent = { connect: { id: dto.parentId } };
        changed.push('parentId');
      }
    }

    if (!changed.length) throw new BadRequestException('لا توجد حقول قابلة للتعديل');

    const updated = await this.prisma.category.update({
      where: { id }, data, select: CATEGORY_SELECT,
    });

    const wasDisabled = changed.includes('isActive') && dto.isActive === false;
    await this.audit.log({
      action: wasDisabled ? AUDIT.CATEGORY_DISABLED : AUDIT.CATEGORY_UPDATED,
      actorId: actor.id,
      entity: 'category',
      entityId: String(id),
      metadata: { changed },
      ...meta,
    });
    return this.serialize(updated as never);
  }

  /** All descendant ids of a node (breadth first, single query per level). */
  async collectDescendants(id: number): Promise<Set<number>> {
    const found = new Set<number>();
    let level = [id];
    let guard = 0;
    while (level.length && guard < 10) {
      const children = await this.prisma.category.findMany({
        where: { parentId: { in: level } },
        select: { id: true },
      });
      const next = children.map((c) => c.id).filter((cid) => !found.has(cid));
      next.forEach((cid) => found.add(cid));
      level = next;
      guard += 1;
    }
    return found;
  }

  /**
   * Soft delete by default (isActive=false) — historical orders must keep workable
   * references. `hard=true` only when the category has no products and no children.
   */
  async remove(id: number, actor: ActorAccess, hard = false, meta: RequestMeta = {}) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        id: true, name: true, isActive: true,
        _count: { select: { children: true, products: true } },
      },
    });
    if (!category) throw new NotFoundException('التصنيف غير موجود');

    if (hard) {
      if (category._count.products > 0) {
        throw new ConflictException('لا يمكن الحذف النهائي — يوجد منتجات مرتبطة بهذا التصنيف');
      }
      if (category._count.children > 0) {
        throw new ConflictException('لا يمكن الحذف النهائي — يوجد تصنيفات فرعية');
      }
      if (!isOwner(actor) && !hasPermission(actor, 'categories.delete')) {
        throw new ForbiddenException('حذف التصنيف نهائياً يتطلب صلاحية categories.delete');
      }
      await this.prisma.category.delete({ where: { id } });
      await this.audit.log({
        action: AUDIT.CATEGORY_DELETED,
        actorId: actor.id,
        entity: 'category',
        entityId: String(id),
        metadata: { name: category.name, hard: true },
        ...meta,
      });
      return { deleted: true, hard: true, id };
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
      select: CATEGORY_SELECT,
    });
    await this.audit.log({
      action: AUDIT.CATEGORY_DISABLED,
      actorId: actor.id,
      entity: 'category',
      entityId: String(id),
      metadata: { name: category.name, soft: true, products: category._count.products },
      ...meta,
    });
    return { deleted: false, softDeleted: true, category: this.serialize(updated as never) };
  }
}
