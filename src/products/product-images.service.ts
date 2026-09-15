import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { STORAGE_PROVIDER, StorageProvider } from '../common/storage/storage.interface';
import { CreateProductImageDto, UpdateProductImageDto, ReorderProductImagesDto } from './dto/product-image.dto';
import { ActorAccess } from '../common/utils/permissions.util';
import { RequestMeta } from './products.service';

const IMAGE_SELECT = {
  id: true, productId: true, url: true, altText: true, sortOrder: true,
  isPrimary: true, createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private async assertProduct(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId }, select: { id: true, sku: true },
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return product;
  }

  async list(productId: number) {
    await this.assertProduct(productId);
    return this.prisma.productImage.findMany({
      where: { productId },
      select: IMAGE_SELECT,
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async add(productId: number, dto: CreateProductImageDto, actor: ActorAccess, meta: RequestMeta = {}) {
    await this.assertProduct(productId);
    const stored = await this.storage.put(dto.url);

    const count = await this.prisma.productImage.count({ where: { productId } });
    if (!count) {
      const created = await this.prisma.productImage.create({
        data: { productId, url: stored.url, altText: dto.altText ?? null, sortOrder: dto.sortOrder ?? 0, isPrimary: true },
        select: IMAGE_SELECT,
      });
      await this.audit.log({
        action: AUDIT.PRODUCT_IMAGE_ADDED,
        actorId: actor.id, entity: 'product', entityId: String(productId),
        metadata: { imageId: created.id, primary: true, provider: stored.provider }, ...meta,
      });
      return created;
    }

    const nextOrder =
      dto.sortOrder ??
      ((await this.prisma.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } }))
        ._max.sortOrder ?? 0) + 1;

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      }
      return tx.productImage.create({
        data: {
          productId, url: stored.url, altText: dto.altText ?? null,
          sortOrder: nextOrder, isPrimary: dto.isPrimary ?? false,
        },
        select: IMAGE_SELECT,
      });
    });

    await this.audit.log({
      action: AUDIT.PRODUCT_IMAGE_ADDED,
      actorId: actor.id, entity: 'product', entityId: String(productId),
      metadata: { imageId: created.id, primary: created.isPrimary, provider: stored.provider }, ...meta,
    });
    return created;
  }

  async update(productId: number, imageId: number, dto: UpdateProductImageDto, actor: ActorAccess, meta: RequestMeta = {}) {
    await this.assertProduct(productId);
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('الصورة غير موجودة');

    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    if (dto.url !== undefined) { data.url = (await this.storage.put(dto.url)).url; changed.push('url'); }
    if (dto.altText !== undefined) { data.altText = dto.altText; changed.push('altText'); }
    if (dto.sortOrder !== undefined) { data.sortOrder = dto.sortOrder; changed.push('sortOrder'); }
    if (dto.isPrimary !== undefined) { changed.push('isPrimary'); }
    if (!changed.length) throw new BadRequestException('لا توجد حقول قابلة للتعديل');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
        data.isPrimary = true;
      } else if (dto.isPrimary === false) {
        if (image.isPrimary) {
          throw new BadRequestException('لا يمكن إلغاء Primary بدون تعيين صورة أخرى — استخدم /primary لصورة أخرى');
        }
        data.isPrimary = false;
      }
      return tx.productImage.update({ where: { id: imageId }, data, select: IMAGE_SELECT });
    });

    await this.audit.log({
      action: AUDIT.PRODUCT_IMAGE_UPDATED,
      actorId: actor.id, entity: 'product', entityId: String(productId),
      metadata: { imageId, changed }, ...meta,
    });
    return updated;
  }

  /** Sets a single primary image — the previous one is cleared in the same transaction. */
  async setPrimary(productId: number, imageId: number, actor: ActorAccess, meta: RequestMeta = {}) {
    await this.assertProduct(productId);
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('الصورة غير موجودة');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      return tx.productImage.update({ where: { id: imageId }, data: { isPrimary: true }, select: IMAGE_SELECT });
    });

    await this.audit.log({
      action: AUDIT.PRODUCT_IMAGE_UPDATED,
      actorId: actor.id, entity: 'product', entityId: String(productId),
      metadata: { imageId, primary: true }, ...meta,
    });
    return updated;
  }

  async remove(productId: number, imageId: number, actor: ActorAccess, meta: RequestMeta = {}) {
    await this.assertProduct(productId);
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('الصورة غير موجودة');

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } });
      if (image.isPrimary) {
        // Keep exactly one primary whenever images remain.
        const next = await tx.productImage.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    });

    await this.audit.log({
      action: AUDIT.PRODUCT_IMAGE_DELETED,
      actorId: actor.id, entity: 'product', entityId: String(productId),
      metadata: { imageId }, ...meta,
    });
    return { deleted: true, id: imageId };
  }

  async reorder(productId: number, dto: ReorderProductImagesDto, actor: ActorAccess, meta: RequestMeta = {}) {
    await this.assertProduct(productId);
    const ids = dto.images.map((i) => i.id);
    const existing = await this.prisma.productImage.findMany({
      where: { productId, id: { in: ids } }, select: { id: true },
    });
    if (existing.length !== ids.length) {
      throw new ConflictException('بعض الصور لا تنتمي لهذا المنتج');
    }
    const orders = dto.images.map((i) => i.sortOrder);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('ترتيب الصور يجب أن يكون فريداً');
    }

    await this.prisma.$transaction(
      dto.images.map((item) =>
        this.prisma.productImage.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } }),
      ),
    );

    await this.audit.log({
      action: AUDIT.PRODUCT_IMAGES_REORDERED,
      actorId: actor.id, entity: 'product', entityId: String(productId),
      metadata: { images: dto.images.length }, ...meta,
    });
    return this.list(productId);
  }
}
