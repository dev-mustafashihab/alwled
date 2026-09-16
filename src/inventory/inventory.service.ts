import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPE } from '../notifications/notifications.constants';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { ListInventoryQueryDto } from './dto/list-inventory.query.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ActorAccess } from '../common/utils/permissions.util';
import type { RequestMeta } from '../common/types/request-meta';

const PRODUCT_MINI = {
  select: { id: true, name: true, sku: true, slug: true, isActive: true,
    category: { select: { id: true, name: true } }, brand: { select: { id: true, name: true } } },
} as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** availableQuantity is always computed — never stored, so it cannot drift. */
  private serialize(row: {
    quantity: number; reservedQuantity: number; lowStockThreshold: number;
  } & Record<string, unknown>) {
    const availableQuantity = row.quantity - row.reservedQuantity;
    return {
      ...row,
      availableQuantity,
      isLowStock: row.quantity <= row.lowStockThreshold,
      isOutOfStock: availableQuantity <= 0,
    };
  }

  async list(query: ListInventoryQueryDto) {
    const { page, limit, search, lowStockOnly, outOfStockOnly, categoryId, brandId, sortBy, sortOrder } = query;

    const where: Prisma.InventoryWhereInput = {};
    const productFilter: Prisma.ProductWhereInput = {};
    if (search?.trim()) {
      const term = search.trim();
      productFilter.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (categoryId) productFilter.categoryId = categoryId;
    if (brandId) productFilter.brandId = brandId;
    if (Object.keys(productFilter).length) where.product = productFilter;

    const orderBy: Prisma.InventoryOrderByWithRelationInput =
      sortBy === 'productName' ? { product: { name: sortOrder } } : { [sortBy]: sortOrder };

    // Low/out-of-stock filters need the computed value, so they run after fetch on a bounded page.
    const needsComputed = !!lowStockOnly || !!outOfStockOnly;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.inventory.count({ where }),
      this.prisma.inventory.findMany({
        where,
        select: {
          id: true, productId: true, quantity: true, reservedQuantity: true,
          lowStockThreshold: true, createdAt: true, updatedAt: true,
          product: PRODUCT_MINI,
        },
        orderBy,
        ...(needsComputed ? {} : { skip: (page - 1) * limit, take: limit }),
      }),
    ]);

    let items = rows.map((r) => this.serialize(r as never));
    if (needsComputed) {
      items = items.filter((i) =>
        (lowStockOnly ? (i as { isLowStock: boolean }).isLowStock : true) &&
        (outOfStockOnly ? (i as { isOutOfStock: boolean }).isOutOfStock : true),
      );
      const from = (page - 1) * limit;
      items = items.slice(from, from + limit);
    }

    const effectiveTotal = needsComputed ? items.length + (page - 1) * limit : total;
    return {
      items,
      meta: { page, limit, total: effectiveTotal, totalPages: Math.max(1, Math.ceil(effectiveTotal / limit)) },
    };
  }

  async getByProduct(productId: number) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { productId },
      select: {
        id: true, productId: true, quantity: true, reservedQuantity: true,
        lowStockThreshold: true, createdAt: true, updatedAt: true, product: PRODUCT_MINI,
      },
    });
    if (!inventory) throw new NotFoundException('لا يوجد سجل مخزون لهذا المنتج');
    return this.serialize(inventory as never);
  }

  async movements(productId: number, limit = 50) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { productId }, select: { id: true },
    });
    if (!inventory) throw new NotFoundException('لا يوجد سجل مخزون لهذا المنتج');
    return this.prisma.inventoryMovement.findMany({
      where: { inventoryId: inventory.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true, type: true, quantity: true, reason: true,
        referenceType: true, referenceId: true, createdBy: true, createdAt: true,
      },
    });
  }

  /** Row-locked read → validate → write inside one transaction (race-safe). */
  private async withLocked<T>(
    productId: number,
    fn: (tx: Prisma.TransactionClient, current: { id: number; quantity: number; reservedQuantity: number; lowStockThreshold: number }) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: number; quantity: number; reserved_quantity: number; low_stock_threshold: number }>
      >`SELECT id, quantity, reserved_quantity, low_stock_threshold FROM inventory WHERE product_id = ${productId} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('لا يوجد سجل مخزون لهذا المنتج');
      const current = {
        id: rows[0].id,
        quantity: rows[0].quantity,
        reservedQuantity: rows[0].reserved_quantity,
        lowStockThreshold: rows[0].low_stock_threshold,
      };
      return fn(tx, current);
    });
  }

  async update(productId: number, dto: UpdateInventoryDto, actor: ActorAccess, meta: RequestMeta = {}) {
    if (dto.lowStockThreshold === undefined && dto.quantity === undefined) {
      throw new BadRequestException('لا توجد حقول قابلة للتعديل');
    }

    const result = await this.withLocked(productId, async (tx, current) => {
      if (dto.quantity !== undefined && dto.quantity < current.reservedQuantity) {
        throw new BadRequestException(
          `الكمية لا يمكن أن تقل عن المحجوز حالياً (${current.reservedQuantity})`,
        );
      }

      const updated = await tx.inventory.update({
        where: { id: current.id },
        data: {
          ...(dto.lowStockThreshold !== undefined ? { lowStockThreshold: dto.lowStockThreshold } : {}),
          ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        },
        select: {
          id: true, productId: true, quantity: true, reservedQuantity: true,
          lowStockThreshold: true, createdAt: true, updatedAt: true,
        },
      });

      if (dto.quantity !== undefined && dto.quantity !== current.quantity) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: current.id,
            type: InventoryMovementType.ADJUSTMENT,
            quantity: dto.quantity - current.quantity,
            reason: 'MANUAL_SET',
            createdBy: actor.id,
          },
        });
      }
      return updated;
    });

    await this.audit.log({
      action: AUDIT.INVENTORY_UPDATED,
      actorId: actor.id, entity: 'inventory', entityId: String(result.id),
      metadata: { productId, ...dto }, ...meta,
    });
    return this.serialize(result as never);
  }

  /**
   * Signed stock movement. Order reservation/release is a later stage — this
   * endpoint only maintains the physical quantity.
   */
  async adjust(productId: number, dto: AdjustInventoryDto, actor: ActorAccess, meta: RequestMeta = {}) {
    if (dto.quantity === 0) throw new BadRequestException('الكمية يجب أن تكون مختلفة عن الصفر');
    const type: InventoryMovementType =
      dto.type ?? (dto.quantity > 0 ? InventoryMovementType.STOCK_IN : InventoryMovementType.STOCK_OUT);

    const result = await this.withLocked(productId, async (tx, current) => {
      const nextQuantity = current.quantity + dto.quantity;
      if (nextQuantity < 0) {
        throw new BadRequestException(
          `الرصيد الناتج سالب (${nextQuantity}) — المخزون الحالي ${current.quantity}`,
        );
      }
      if (nextQuantity < current.reservedQuantity) {
        throw new BadRequestException(
          `الرصيد الناتج (${nextQuantity}) أقل من الكمية المحجوزة (${current.reservedQuantity})`,
        );
      }

      const updated = await tx.inventory.update({
        where: { id: current.id },
        data: { quantity: nextQuantity },
        select: {
          id: true, productId: true, quantity: true, reservedQuantity: true,
          lowStockThreshold: true, createdAt: true, updatedAt: true,
        },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryId: current.id,
          type,
          quantity: dto.quantity,
          reason: dto.reason,
          referenceType: 'MANUAL',
          createdBy: actor.id,
        },
        select: { id: true, type: true, quantity: true, reason: true, createdAt: true },
      });

      // Threshold-crossing alerts only — never one per adjustment (no spam):
      // available = quantity - reservedQuantity, and a notification is enqueued
      // only when the record CROSSES its own low-stock threshold or hits zero.
      const beforeAvailable = current.quantity - current.reservedQuantity;
      const afterAvailable = updated.quantity - updated.reservedQuantity;
      const product = await tx.product.findUnique({
        where: { id: productId }, select: { name: true, sku: true },
      });
      const crossing = (type: string) => ({
        type,
        aggregateType: 'inventory',
        // the movement id makes each genuine crossing its own deterministic event
        aggregateId: `${productId}:mv${movement.id}`,
        permissionKey: 'inventory.read',
        payload: {
          productName: product?.name,
          sku: product?.sku,
          available: afterAvailable,
          threshold: updated.lowStockThreshold,
        },
      });
      if (beforeAvailable > 0 && afterAvailable <= 0) {
        await this.notifications.enqueue(tx, crossing(NOTIFICATION_TYPE.OUT_OF_STOCK) as never);
      } else if (beforeAvailable > updated.lowStockThreshold && afterAvailable <= updated.lowStockThreshold) {
        await this.notifications.enqueue(tx, crossing(NOTIFICATION_TYPE.LOW_STOCK) as never);
      }

      return { updated, movement, previousQuantity: current.quantity };
    });

    await this.notifications.dispatchSafely();

    await this.audit.log({
      action: AUDIT.INVENTORY_ADJUSTED,
      actorId: actor.id, entity: 'inventory', entityId: String(result.updated.id),
      metadata: {
        productId,
        delta: dto.quantity,
        previousQuantity: result.previousQuantity,
        quantity: result.updated.quantity,
        reason: dto.reason,
        type,
      },
      ...meta,
    });

    return {
      ...this.serialize(result.updated as never),
      movement: result.movement,
    };
  }
}
