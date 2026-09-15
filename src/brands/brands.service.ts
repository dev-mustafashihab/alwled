import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands.query.dto';
import { ActorAccess, hasPermission } from '../common/utils/permissions.util';
import { slugify, uniqueSlug } from '../common/utils/slug.util';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const BRAND_SELECT = {
  id: true, name: true, slug: true, description: true, logo: true,
  isActive: true, sortOrder: true, createdAt: true, updatedAt: true,
  _count: { select: { products: true } },
} as const;

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private canSeeInactive(actor?: ActorAccess | null): boolean {
    return !!actor && hasPermission(actor, 'brands.read');
  }

  private serialize(row: { _count?: { products: number } } & Record<string, unknown>) {
    const { _count, ...rest } = row;
    return { ...rest, productsCount: _count?.products ?? 0 };
  }

  async list(query: ListBrandsQueryDto, actor?: ActorAccess | null) {
    const { page, limit, search, includeInactive, sortBy, sortOrder } = query;
    const showInactive = !!includeInactive && this.canSeeInactive(actor);

    const where: Prisma.BrandWhereInput = {};
    if (!showInactive) where.isActive = true;
    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        select: BRAND_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.serialize(r as never)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findBySlugOrId(idOrSlug: string, actor?: ActorAccess | null) {
    const numeric = Number(idOrSlug);
    const row = await this.prisma.brand.findFirst({
      where: Number.isInteger(numeric) && numeric > 0 ? { id: numeric } : { slug: idOrSlug },
      select: BRAND_SELECT,
    });
    if (!row) throw new NotFoundException('العلامة التجارية غير موجودة');
    if (!row.isActive && !this.canSeeInactive(actor)) {
      throw new NotFoundException('العلامة التجارية غير موجودة');
    }
    return this.serialize(row as never);
  }

  async create(dto: CreateBrandDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const name = dto.name.trim();
    const nameClash = await this.prisma.brand.findUnique({ where: { name }, select: { id: true } });
    if (nameClash) throw new ConflictException('اسم العلامة التجارية مستخدم مسبقاً');

    const slug = dto.slug
      ? slugify(dto.slug)
      : await uniqueSlug(name, async (c) => !!(await this.prisma.brand.findUnique({ where: { slug: c }, select: { id: true } })));
    const slugClash = await this.prisma.brand.findUnique({ where: { slug }, select: { id: true } });
    if (slugClash) throw new ConflictException('الـslug مستخدم مسبقاً');

    const created = await this.prisma.brand.create({
      data: {
        name,
        slug,
        description: dto.description ?? null,
        logo: dto.logo ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      select: BRAND_SELECT,
    });

    await this.audit.log({
      action: AUDIT.BRAND_CREATED,
      actorId: actor.id,
      entity: 'brand',
      entityId: String(created.id),
      metadata: { slug },
      ...meta,
    });
    return this.serialize(created as never);
  }

  async update(id: number, dto: UpdateBrandDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const current = await this.prisma.brand.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('العلامة التجارية غير موجودة');

    const data: Prisma.BrandUpdateInput = {};
    const changed: string[] = [];

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const clash = await this.prisma.brand.findUnique({ where: { name }, select: { id: true } });
      if (clash && clash.id !== id) throw new ConflictException('اسم العلامة التجارية مستخدم مسبقاً');
      data.name = name; changed.push('name');
    }
    if (dto.slug !== undefined) {
      const slug = slugify(dto.slug);
      const clash = await this.prisma.brand.findUnique({ where: { slug }, select: { id: true } });
      if (clash && clash.id !== id) throw new ConflictException('الـslug مستخدم مسبقاً');
      data.slug = slug; changed.push('slug');
    }
    if (dto.description !== undefined) { data.description = dto.description; changed.push('description'); }
    if (dto.logo !== undefined) { data.logo = dto.logo; changed.push('logo'); }
    if (dto.sortOrder !== undefined) { data.sortOrder = dto.sortOrder; changed.push('sortOrder'); }
    if (dto.isActive !== undefined) { data.isActive = dto.isActive; changed.push('isActive'); }

    if (!changed.length) throw new BadRequestException('لا توجد حقول قابلة للتعديل');

    const updated = await this.prisma.brand.update({ where: { id }, data, select: BRAND_SELECT });
    const wasDisabled = changed.includes('isActive') && dto.isActive === false;

    await this.audit.log({
      action: wasDisabled ? AUDIT.BRAND_DISABLED : AUDIT.BRAND_UPDATED,
      actorId: actor.id,
      entity: 'brand',
      entityId: String(id),
      metadata: { changed },
      ...meta,
    });
    return this.serialize(updated as never);
  }

  async remove(id: number, actor: ActorAccess, hard = false, meta: RequestMeta = {}) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException('العلامة التجارية غير موجودة');

    if (hard) {
      if (brand._count.products > 0) {
        throw new ConflictException('لا يمكن الحذف النهائي — يوجد منتجات مرتبطة بهذه العلامة');
      }
      await this.prisma.brand.delete({ where: { id } });
      await this.audit.log({
        action: AUDIT.BRAND_DELETED,
        actorId: actor.id,
        entity: 'brand',
        entityId: String(id),
        metadata: { name: brand.name, hard: true },
        ...meta,
      });
      return { deleted: true, hard: true, id };
    }

    const updated = await this.prisma.brand.update({
      where: { id }, data: { isActive: false }, select: BRAND_SELECT,
    });
    await this.audit.log({
      action: AUDIT.BRAND_DISABLED,
      actorId: actor.id,
      entity: 'brand',
      entityId: String(id),
      metadata: { name: brand.name, soft: true, products: brand._count.products },
      ...meta,
    });
    return { deleted: false, softDeleted: true, brand: this.serialize(updated as never) };
  }
}
