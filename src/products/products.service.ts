import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { ActorAccess, hasPermission } from '../common/utils/permissions.util';
import { generateSku, slugify, uniqueSlug } from '../common/utils/slug.util';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Money helper — NUMERIC(12,2) in the DB, string in JSON. Never float arithmetic. */
export const money = (value: number | string | Prisma.Decimal): Prisma.Decimal =>
  new Prisma.Decimal(typeof value === 'number' ? value.toFixed(2) : value);

export const toMoneyString = (value: Prisma.Decimal | null | undefined): string | null =>
  value === null || value === undefined ? null : new Prisma.Decimal(value).toFixed(2);

const LIST_SELECT: Prisma.ProductSelect = {
  id: true, name: true, slug: true, sku: true, shortDescription: true,
  price: true, compareAtPrice: true, isActive: true, isFeatured: true,
  createdAt: true, updatedAt: true,
  brand: { select: { id: true, name: true, slug: true, isActive: true } },
  category: { select: { id: true, name: true, slug: true, isActive: true } },
  images: {
    select: { id: true, url: true, altText: true, isPrimary: true, sortOrder: true },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
  },
};

const DETAIL_SELECT: Prisma.ProductSelect = {
  ...LIST_SELECT,
  description: true,
  images: {
    select: { id: true, url: true, altText: true, isPrimary: true, sortOrder: true, createdAt: true },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
  },
  specifications: {
    select: {
      id: true, value: true,
      specification: { select: { id: true, key: true, name: true, type: true, unit: true, options: true } },
    },
    orderBy: { specification: { sortOrder: 'asc' } },
  },
  inventory: {
    select: { id: true, quantity: true, reservedQuantity: true, lowStockThreshold: true, updatedAt: true },
  },
};

/** Shape returned by LIST_SELECT / DETAIL_SELECT (relations included). */
export interface ProductRow {
  id: number;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string | null;
  description?: string | null;
  price: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
  brand: { id: number; name: string; slug: string; isActive: boolean };
  category: { id: number; name: string; slug: string; isActive: boolean };
  images: Array<{ id: number; url: string; altText: string | null; isPrimary: boolean; sortOrder: number; createdAt?: Date }>;
  specifications?: Array<{
    id: number; value: string;
    specification: { id: number; key: string; name: string; type: string; unit: string | null; options: string[] };
  }>;
  inventory?: {
    id: number; quantity: number; reservedQuantity: number; lowStockThreshold: number; updatedAt?: Date;
  } | null;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------- helpers ------------------------------- */

  private isStaff(actor?: ActorAccess | null): boolean {
    return !!actor && hasPermission(actor, 'products.read');
  }

  private serialize(product: ProductRow | (Record<string, unknown> & Partial<ProductRow>)): Record<string, unknown> {
    const price = product.price as Prisma.Decimal;
    const compareAtPrice = (product.compareAtPrice ?? null) as Prisma.Decimal | null;
    const inventory = product.inventory ?? null;
    const images = product.images ?? [];

    const base: Record<string, unknown> = {
      ...product,
      price: toMoneyString(price),
      compareAtPrice: toMoneyString(compareAtPrice),
      hasDiscount: !!compareAtPrice && new Prisma.Decimal(compareAtPrice).greaterThan(price),
      discountPercentage:
        compareAtPrice && new Prisma.Decimal(compareAtPrice).greaterThan(price)
          ? Number(
              new Prisma.Decimal(compareAtPrice)
                .minus(price)
                .dividedBy(compareAtPrice)
                .times(100)
                .toFixed(2),
            )
          : 0,
      primaryImage: images.length ? images[0].url : null,
    };

    if (inventory) {
      base.inventory = {
        ...inventory,
        availableQuantity: inventory.quantity - inventory.reservedQuantity,
        isLowStock: inventory.quantity <= inventory.lowStockThreshold,
      };
    }
    return base;
  }

  private async loadCategoryOrFail(categoryId: number, mustBeActive: boolean) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, isActive: true },
    });
    if (!category) throw new BadRequestException('التصنيف غير موجود');
    if (mustBeActive && !category.isActive) {
      throw new BadRequestException('لا يمكن نشر منتج في تصنيف غير نشط — اجعله Draft أو فعّل التصنيف');
    }
    return category;
  }

  private async loadBrandOrFail(brandId: number, mustBeActive: boolean) {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, name: true, isActive: true },
    });
    if (!brand) throw new BadRequestException('العلامة التجارية غير موجودة');
    if (mustBeActive && !brand.isActive) {
      throw new BadRequestException('لا يمكن نشر منتج لعلامة تجارية غير نشطة');
    }
    return brand;
  }

  private assertPriceRules(price: Prisma.Decimal, compareAtPrice?: Prisma.Decimal | null) {
    if (price.lessThan(0)) throw new BadRequestException('السعر لا يمكن أن يكون سالباً');
    if (compareAtPrice && compareAtPrice.lessThan(price)) {
      throw new BadRequestException('سعر المقارنة يجب أن يكون أكبر من أو يساوي السعر الحالي');
    }
  }

  private async resolveSlug(desired: string | undefined, name: string, ignoreId?: number) {
    if (desired) {
      const slug = slugify(desired);
      const clash = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
      if (clash && clash.id !== ignoreId) throw new ConflictException('الـslug مستخدم مسبقاً');
      return slug;
    }
    return uniqueSlug(name, async (candidate) => {
      const clash = await this.prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } });
      return !!clash && clash.id !== ignoreId;
    });
  }

  private async resolveSku(desired: string | undefined, name: string, categorySlug: string | null, ignoreId?: number) {
    let sku = desired?.trim().toUpperCase();
    if (!sku) {
      // Deterministic base + numeric suffix until free (no randomness).
      const base = generateSku([categorySlug, name], 'PRD');
      sku = base;
      let counter = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const clash = await this.prisma.product.findUnique({ where: { sku }, select: { id: true } });
        if (!clash || clash.id === ignoreId) break;
        counter += 1;
        sku = `${base}-${String(counter).padStart(3, '0')}`;
        if (counter > 500) throw new ConflictException('تعذّر توليد SKU فريد — أدخله يدوياً');
      }
      return sku;
    }
    const clash = await this.prisma.product.findUnique({ where: { sku }, select: { id: true } });
    if (clash && clash.id !== ignoreId) throw new ConflictException('الـSKU مستخدم مسبقاً');
    return sku;
  }

  /* ------------------------------- queries ------------------------------- */

  async list(query: ListProductsQueryDto, actor?: ActorAccess | null) {
    const {
      page, limit, search, categoryId, brandId, isFeatured, isActive,
      includeInactive, minPrice, maxPrice, includeInventory, sortBy, sortOrder,
    } = query;

    const staff = this.isStaff(actor);
    const showInactive = !!includeInactive && staff;
    const withInventory = !!includeInventory && !!actor && hasPermission(actor, 'inventory.read');

    const AND: Prisma.ProductWhereInput[] = [];

    if (!showInactive) {
      // Public storefront rule: active product in an active category and brand.
      if (isActive === undefined || isActive === true) {
        AND.push({ isActive: true }, { category: { isActive: true } }, { brand: { isActive: true } });
      } else if (staff) {
        AND.push({ isActive: false });
      } else {
        AND.push({ isActive: true }, { category: { isActive: true } }, { brand: { isActive: true } });
      }
    } else if (isActive !== undefined) {
      AND.push({ isActive });
    }

    if (search?.trim()) {
      const term = search.trim();
      AND.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { slug: { contains: term, mode: 'insensitive' } },
          { shortDescription: { contains: term, mode: 'insensitive' } },
        ],
      });
    }
    if (categoryId) AND.push({ categoryId });
    if (brandId) AND.push({ brandId });
    if (isFeatured !== undefined) AND.push({ isFeatured });
    if (minPrice !== undefined || maxPrice !== undefined) {
      AND.push({
        price: {
          ...(minPrice !== undefined ? { gte: money(minPrice) } : {}),
          ...(maxPrice !== undefined ? { lte: money(maxPrice) } : {}),
        },
      });
    }

    const where: Prisma.ProductWhereInput = AND.length ? { AND } : {};

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: withInventory ? { ...LIST_SELECT, inventory: DETAIL_SELECT.inventory } : LIST_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: (rows as unknown as ProductRow[]).map((r) => this.serialize(r)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findBySlugOrId(idOrSlug: string, actor?: ActorAccess | null) {
    const numeric = Number(idOrSlug);
    const where: Prisma.ProductWhereInput =
      Number.isInteger(numeric) && numeric > 0 ? { id: numeric } : { slug: idOrSlug };
    const found = await this.prisma.product.findFirst({ where, select: DETAIL_SELECT });
    if (!found) throw new NotFoundException('المنتج غير موجود');
    const product = found as unknown as ProductRow;

    const staff = this.isStaff(actor);
    const visible = product.isActive && product.category.isActive && product.brand.isActive;
    if (!visible && !staff) throw new NotFoundException('المنتج غير موجود');

    const serialized = this.serialize(product);
    if (!staff || !actor || !hasPermission(actor, 'inventory.read')) {
      // Never leak internal stock numbers to the storefront.
      delete serialized.inventory;
      serialized.inStock = (product.inventory?.quantity ?? 0) > (product.inventory?.reservedQuantity ?? 0);
    }
    return serialized;
  }

  /* ------------------------------ mutations ------------------------------ */

  async create(dto: CreateProductDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const isActive = dto.isActive ?? true;
    const [category] = await Promise.all([
      this.loadCategoryOrFail(dto.categoryId, isActive),
      this.loadBrandOrFail(dto.brandId, isActive),
    ]);

    const price = money(dto.price);
    const compareAt = dto.compareAtPrice !== undefined ? money(dto.compareAtPrice) : null;
    this.assertPriceRules(price, compareAt);

    const slug = await this.resolveSlug(dto.slug, dto.name);
    const sku = await this.resolveSku(dto.sku, dto.name, category.name ? slugify(category.name) : null);

    // Product + its inventory row are created together (one logical operation).
    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: dto.name.trim(),
          slug,
          sku,
          shortDescription: dto.shortDescription ?? null,
          description: dto.description ?? null,
          price,
          compareAtPrice: compareAt,
          brandId: dto.brandId,
          categoryId: dto.categoryId,
          isActive,
          isFeatured: dto.isFeatured ?? false,
        },
        select: { id: true },
      });
      await tx.inventory.create({ data: { productId: product.id, quantity: 0, lowStockThreshold: 5 } });
      // Re-read inside the transaction so the response carries the inventory row.
      const full = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: DETAIL_SELECT });
      return full as unknown as ProductRow;
    });

    await this.audit.log({
      action: AUDIT.PRODUCT_CREATED,
      actorId: actor.id,
      entity: 'product',
      entityId: String(created.id),
      metadata: { sku, slug, price: toMoneyString(price), categoryId: dto.categoryId, brandId: dto.brandId },
      ...meta,
    });
    return this.serialize(created);
  }

  async update(id: number, dto: UpdateProductDto, actor: ActorAccess, meta: RequestMeta = {}) {
    const current = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, slug: true, sku: true, price: true, compareAtPrice: true, isActive: true, categoryId: true, brandId: true },
    });
    if (!current) throw new NotFoundException('المنتج غير موجود');

    const nextActive = dto.isActive ?? current.isActive;
    const nextCategoryId = dto.categoryId ?? current.categoryId;
    const nextBrandId = dto.brandId ?? current.brandId;

    if (dto.categoryId !== undefined || dto.isActive !== undefined) {
      await this.loadCategoryOrFail(nextCategoryId, nextActive);
    }
    if (dto.brandId !== undefined || dto.isActive !== undefined) {
      await this.loadBrandOrFail(nextBrandId, nextActive);
    }

    const data: Prisma.ProductUpdateInput = {};
    const changed: string[] = [];

    if (dto.name !== undefined) { data.name = dto.name.trim(); changed.push('name'); }
    if (dto.shortDescription !== undefined) { data.shortDescription = dto.shortDescription; changed.push('shortDescription'); }
    if (dto.description !== undefined) { data.description = dto.description; changed.push('description'); }
    if (dto.isFeatured !== undefined) { data.isFeatured = dto.isFeatured; changed.push('isFeatured'); }
    if (dto.isActive !== undefined) { data.isActive = dto.isActive; changed.push('isActive'); }
    if (dto.categoryId !== undefined) { data.category = { connect: { id: dto.categoryId } }; changed.push('categoryId'); }
    if (dto.brandId !== undefined) { data.brand = { connect: { id: dto.brandId } }; changed.push('brandId'); }

    if (dto.slug !== undefined) {
      data.slug = await this.resolveSlug(dto.slug, dto.name ?? current.slug, id);
      changed.push('slug');
    }
    if (dto.sku !== undefined) {
      data.sku = await this.resolveSku(dto.sku, dto.name ?? current.sku, null, id);
      changed.push('sku');
    }

    if (dto.price !== undefined || dto.compareAtPrice !== undefined) {
      const price = dto.price !== undefined ? money(dto.price) : new Prisma.Decimal(current.price);
      const rawCompare =
        dto.compareAtPrice === null
          ? null
          : dto.compareAtPrice !== undefined
            ? money(dto.compareAtPrice)
            : current.compareAtPrice;
      this.assertPriceRules(price, rawCompare as Prisma.Decimal | null);
      if (dto.price !== undefined) { data.price = price; changed.push('price'); }
      if (dto.compareAtPrice !== undefined) { data.compareAtPrice = rawCompare; changed.push('compareAtPrice'); }
    }

    if (!changed.length) throw new BadRequestException('لا توجد حقول قابلة للتعديل');

    const updated = (await this.prisma.product.update({ where: { id }, data, select: DETAIL_SELECT })) as unknown as ProductRow;
    const disabled = changed.includes('isActive') && dto.isActive === false;

    await this.audit.log({
      action: disabled ? AUDIT.PRODUCT_DISABLED : AUDIT.PRODUCT_UPDATED,
      actorId: actor.id,
      entity: 'product',
      entityId: String(id),
      metadata: { changed },
      ...meta,
    });
    return this.serialize(updated);
  }

  /** Soft delete (isActive=false) by default. Hard delete is refused once stock history exists. */
  async remove(id: number, actor: ActorAccess, hard = false, meta: RequestMeta = {}) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true, name: true, sku: true,
        inventory: { select: { id: true, _count: { select: { movements: true } } } },
      },
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');

    if (hard) {
      const movements = product.inventory?._count.movements ?? 0;
      if (movements > 0) {
        throw new ConflictException('لا يمكن الحذف النهائي — يوجد حركات مخزون مسجّلة لهذا المنتج');
      }
      await this.prisma.product.delete({ where: { id } });
      await this.audit.log({
        action: AUDIT.PRODUCT_DELETED,
        actorId: actor.id,
        entity: 'product',
        entityId: String(id),
        metadata: { sku: product.sku, hard: true },
        ...meta,
      });
      return { deleted: true, hard: true, id };
    }

    const updated = (await this.prisma.product.update({
      where: { id }, data: { isActive: false }, select: DETAIL_SELECT,
    })) as unknown as ProductRow;
    await this.audit.log({
      action: AUDIT.PRODUCT_DISABLED,
      actorId: actor.id,
      entity: 'product',
      entityId: String(id),
      metadata: { sku: product.sku, soft: true },
      ...meta,
    });
    return { deleted: false, softDeleted: true, product: this.serialize(updated) };
  }
}
