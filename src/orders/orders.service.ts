import {
  ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { IDEMPOTENCY_SCOPES, ORDER_LIMITS } from '../common/constants';
import { money, multiplyMoney, sumMoney, toMoneyString } from '../common/utils/money.util';
import type { RequestMeta } from '../common/types/request-meta';
import { CART_PRODUCT_SELECT, CartProductRow, availableQuantityOf, isProductPublishable } from '../cart/cart.constants';
import { AdminListOrdersQueryDto } from './dto/admin-list-orders.query.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  CUSTOMER_CANCELLABLE_STATUSES, ORDER_DETAIL_SELECT, ORDER_LIST_SELECT, canTransition,
} from './orders.constants';

export interface ActorRef {
  id: string;
  isStaff: boolean;
}

type OrderListRow = {
  id: number; orderNumber: string; status: OrderStatus;
  subtotal: Prisma.Decimal; shippingAmount: Prisma.Decimal; discountAmount: Prisma.Decimal;
  total: Prisma.Decimal; currency: string; createdAt: Date;
  cancelledAt: Date | null; cancellationReason: string | null;
  _count: { items: number };
};

type OrderDetailRow = OrderListRow & {
  userId: string;
  updatedAt: Date;
  items: Array<{
    id: number; productId: number | null; productName: string; productSku: string;
    productSlug: string | null; productImage: string | null;
    unitPrice: Prisma.Decimal; quantity: number; lineSubtotal: Prisma.Decimal;
  }>;
};

/**
 * Orders are immutable historical snapshots. Stock is *reserved* (reservedQuantity),
 * never sold, in this stage: quantity stays untouched until a later stage records
 * the actual sale.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------ serializers ----------------------------- */

  private serializeList(order: OrderListRow) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotal: toMoneyString(order.subtotal),
      shippingAmount: toMoneyString(order.shippingAmount),
      discountAmount: toMoneyString(order.discountAmount),
      total: toMoneyString(order.total),
      currency: order.currency,
      itemCount: order._count.items,
      createdAt: order.createdAt,
      cancelledAt: order.cancelledAt,
      cancellationReason: order.cancellationReason,
    };
  }

  private serializeDetail(order: OrderDetailRow) {
    return {
      ...this.serializeList(order),
      userId: order.userId,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        productSlug: item.productSlug,
        productImage: item.productImage,
        unitPrice: toMoneyString(item.unitPrice),
        quantity: item.quantity,
        lineSubtotal: toMoneyString(item.lineSubtotal),
      })),
    };
  }

  /* ------------------------------ order number ---------------------------- */

  /** Atomic and gap-tolerant: never derived from client input or row ids. */
  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('order_number_seq')`;
    const value = Number(rows[0].nextval);
    return `ORD-${new Date().getUTCFullYear()}-${String(value).padStart(6, '0')}`;
  }

  /* --------------------------- inventory locking --------------------------- */

  /**
   * Locks ONLY the inventory rows of the given products (never the whole table).
   * Must be called inside the same transaction that performs the reservation.
   */
  private async lockInventoryRows(tx: Prisma.TransactionClient, productIds: number[]) {
    if (!productIds.length) return [] as Array<{ id: number; product_id: number; quantity: number; reserved_quantity: number }>;
    return tx.$queryRaw<Array<{ id: number; product_id: number; quantity: number; reserved_quantity: number }>>`
      SELECT id, product_id, quantity, reserved_quantity
      FROM inventory
      WHERE product_id IN (${Prisma.join(productIds)})
      FOR UPDATE
    `;
  }

  /* ------------------------------- creation ------------------------------- */

  /**
   * POST /orders — creates the order from the server-side cart inside ONE
   * transaction: idempotency row → inventory locks → validation → snapshots →
   * order + items → reservation + movements → cart cleared.
   * Any failure rolls the whole thing back (no partial order, no reservation).
   */
  async create(
    userId: string,
    idempotencyKey: string,
    meta: RequestMeta = {},
  ): Promise<{ order: unknown; replayed: boolean }> {
    const key = (idempotencyKey ?? '').trim();
    if (!key) throw new ConflictException('ترويسة Idempotency-Key مطلوبة');
    if (key.length > ORDER_LIMITS().idempotencyKeyMaxLength) {
      throw new ConflictException('Idempotency-Key طويل جداً');
    }

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: {
        id: true,
        items: { select: { productId: true, quantity: true }, orderBy: { productId: 'asc' } },
      },
    });

    // Same cart content ⇒ same request. A different cart with the same key is a conflict.
    const requestHash = createHash('sha256')
      .update(JSON.stringify((cart?.items ?? []).map((i) => [i.productId, i.quantity])))
      .digest('hex');

    // Replay check runs BEFORE the empty-cart rule: after a successful order the
    // cart is empty, yet the same Idempotency-Key must still return the same order.
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPES.ORDER, key } },
      select: { requestHash: true, orderId: true },
    });
    if (existing) {
      // A completed key whose cart is now empty is a plain replay (the first
      // request consumed the cart). A non-empty cart with a different fingerprint
      // is a genuine key reuse with different content.
      const cartEmptiedByOrder = !cart || cart.items.length === 0;
      if (existing.requestHash !== requestHash && !(existing.orderId && cartEmptiedByOrder)) {
        throw new ConflictException('Idempotency-Key مستخدم مسبقاً بطلب مختلف');
      }
      if (existing.orderId) {
        const order = await this.prisma.order.findUnique({
          where: { id: existing.orderId },
          select: ORDER_DETAIL_SELECT,
        });
        if (order) return { order: this.serializeDetail(order as unknown as OrderDetailRow), replayed: true };
      }
      throw new ConflictException('الطلب قيد المعالجة — أعد المحاولة بعد لحظات');
    }

    if (!cart || cart.items.length === 0) {
      throw new ConflictException('السلة فارغة — لا يمكن إنشاء طلب');
    }
    if (cart.items.length > ORDER_LIMITS().maxItemsPerOrder) {
      throw new ConflictException(`الحد الأقصى لعدد المنتجات في الطلب هو ${ORDER_LIMITS().maxItemsPerOrder}`);
    }

    let created: { id: number; orderNumber: string; reserved: Array<{ productId: number; quantity: number }> };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // 1) Claim the idempotency key first: the unique index serialises double submits.
        await tx.idempotencyKey.create({
          data: { userId, key, requestHash, scope: IDEMPOTENCY_SCOPES.ORDER },
        });

        const productIds = cart.items.map((i) => i.productId);
        // 2) Row-level locks — concurrent orders for the same product serialise here.
        const lockedRows = await this.lockInventoryRows(tx, productIds);
        const lockedByProduct = new Map(lockedRows.map((r) => [r.product_id, r]));

        // 3) Reload products and validate inside the lock.
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: CART_PRODUCT_SELECT,
        });
        const byId = new Map(products.map((p) => [p.id, p as unknown as CartProductRow]));

        for (const item of cart.items) {
          const product = byId.get(item.productId);
          if (!product) throw new NotFoundException(`منتج غير موجود (${item.productId})`);
          if (item.quantity < 1) throw new ConflictException('كمية غير صالحة في السلة');
          if (!isProductPublishable(product)) {
            throw new ConflictException(`المنتج «${product.name}» غير متاح حالياً — حدّث السلة`);
          }
          const row = lockedByProduct.get(item.productId);
          const available = row ? Math.max(0, row.quantity - row.reserved_quantity) : 0;
          if (available < item.quantity) {
            throw new ConflictException(
              `الكمية المطلوبة من «${product.name}» غير متوفرة — المتاح ${available}`,
            );
          }
        }

        // 4) Snapshots + server-side totals.
        const lines = cart.items.map((item) => {
          const product = byId.get(item.productId)!;
          const unitPrice = money(product.price);
          return {
            product,
            quantity: item.quantity,
            unitPrice,
            lineSubtotal: multiplyMoney(unitPrice, item.quantity),
          };
        });
        const subtotal = sumMoney(lines.map((l) => l.lineSubtotal));
        const shippingAmount = money(0);
        const discountAmount = money(0);
        const total = sumMoney([subtotal, shippingAmount]).minus(discountAmount);

        // 5) Order + immutable items.
        const orderNumber = await this.nextOrderNumber(tx);
        const order = await tx.order.create({
          data: {
            orderNumber,
            userId,
            status: OrderStatus.PENDING,
            subtotal,
            shippingAmount,
            discountAmount,
            total,
            currency: 'USD',
            items: {
              create: lines.map((line) => ({
                productId: line.product.id,
                productName: line.product.name,
                productSku: line.product.sku,
                productSlug: line.product.slug,
                productImage: line.product.images?.length ? line.product.images[0].url : null,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineSubtotal: line.lineSubtotal,
              })),
            },
          },
          select: { id: true, orderNumber: true },
        });

        // 6) Reservation: reservedQuantity += qty (quantity is NEVER reduced here).
        for (const line of lines) {
          const row = lockedByProduct.get(line.product.id);
          if (!row) throw new ConflictException('سجل مخزون مفقود — لا يمكن الحجز');
          await tx.inventory.update({
            where: { id: row.id },
            data: { reservedQuantity: { increment: line.quantity } },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: row.id,
              type: 'RESERVATION',
              quantity: line.quantity,
              reason: 'ORDER_RESERVATION',
              referenceType: 'ORDER',
              referenceId: String(order.id),
              createdBy: userId,
            },
          });
        }

        // 7) Cart is emptied only when everything else succeeded.
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        await tx.idempotencyKey.update({
          where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPES.ORDER, key } },
          data: { orderId: order.id, statusCode: 201 },
        });

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          reserved: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        };
      }, { timeout: 20000 });
    } catch (error) {
      // Lost the idempotency race against a concurrent identical request: replay it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.idempotencyKey.findUnique({
          where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPES.ORDER, key } },
          select: { requestHash: true, orderId: true },
        });
        if (winner?.orderId && winner.requestHash === requestHash) {
          const order = await this.prisma.order.findUnique({
            where: { id: winner.orderId }, select: ORDER_DETAIL_SELECT,
          });
          if (order) return { order: this.serializeDetail(order as unknown as OrderDetailRow), replayed: true };
        }
        throw new ConflictException('طلب مكرر قيد المعالجة');
      }
      throw error;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: created.id }, select: ORDER_DETAIL_SELECT,
    });

    await this.audit.log({
      action: AUDIT.ORDER_CREATED,
      actorId: userId,
      entity: 'order',
      entityId: String(created.id),
      metadata: { orderNumber: created.orderNumber, items: created.reserved.length },
      ...meta,
    });
    await this.audit.log({
      action: AUDIT.ORDER_RESERVATION_CREATED,
      actorId: userId,
      entity: 'order',
      entityId: String(created.id),
      metadata: { reserved: created.reserved },
      ...meta,
    });

    return { order: this.serializeDetail(order as unknown as OrderDetailRow), replayed: false };
  }

  /* -------------------------------- reads --------------------------------- */

  async listMine(userId: string, query: ListOrdersQueryDto) {
    const { page, limit, status, sortBy, sortOrder } = query;
    const where: Prisma.OrderWhereInput = { userId, ...(status ? { status } : {}) };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: ORDER_LIST_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: (rows as unknown as OrderListRow[]).map((r) => this.serializeList(r)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Customers only see their own orders; staff may read any order. */
  async findOne(orderId: number, actor: ActorRef) {
    const where: Prisma.OrderWhereInput = actor.isStaff ? { id: orderId } : { id: orderId, userId: actor.id };
    const order = await this.prisma.order.findFirst({ where, select: ORDER_DETAIL_SELECT });
    // 404 (not 403) so the existence of another customer's order is never leaked.
    if (!order) throw new NotFoundException('الطلب غير موجود');
    return this.serializeDetail(order as unknown as OrderDetailRow);
  }

  async adminList(query: AdminListOrdersQueryDto) {
    const { page, limit, status, orderNumber, userId, createdFrom, createdTo, sortBy, sortOrder } = query;
    const where: Prisma.OrderWhereInput = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (orderNumber) where.orderNumber = { contains: orderNumber, mode: 'insensitive' };
    if (createdFrom || createdTo) {
      where.createdAt = {
        ...(createdFrom ? { gte: new Date(createdFrom) } : {}),
        ...(createdTo ? { lte: new Date(createdTo) } : {}),
      };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: { ...ORDER_LIST_SELECT, userId: true },
        orderBy: [{ [sortBy]: sortOrder }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        ...this.serializeList(row as unknown as OrderListRow),
        userId: (row as unknown as { userId: string }).userId,
      })),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /* ------------------------------ cancellation ---------------------------- */

  /**
   * Cancels an order: releases the reservation (reservedQuantity -= qty) and logs
   * a RELEASE movement. `quantity` is never modified — nothing was sold.
   * The order row is locked FOR UPDATE so a double cancellation can only ever
   * release the stock once.
   */
  async cancel(
    orderId: number,
    actor: ActorRef,
    reason: string | undefined,
    meta: RequestMeta = {},
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const orders = await tx.$queryRaw<
        Array<{ id: number; user_id: string; status: OrderStatus; order_number: string }>
      >`SELECT id, user_id, status, order_number FROM orders WHERE id = ${orderId} FOR UPDATE`;

      if (!orders.length) throw new NotFoundException('الطلب غير موجود');
      const order = orders[0];
      if (!actor.isStaff && order.user_id !== actor.id) {
        throw new NotFoundException('الطلب غير موجود');
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new ConflictException('الطلب ملغى مسبقاً');
      }
      if (!actor.isStaff && !CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
        throw new ConflictException('لا يمكن إلغاء الطلب بعد تأكيده — تواصل مع الدعم');
      }
      if (actor.isStaff && !canTransition(order.status, OrderStatus.CANCELLED)) {
        throw new ConflictException(`لا يمكن الإلغاء من الحالة ${order.status}`);
      }

      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { productId: true, quantity: true, productName: true },
      });
      const productIds = items.map((i) => i.productId).filter((id): id is number => id !== null);

      if (productIds.length) {
        const locked = await tx.$queryRaw<Array<{ id: number; product_id: number; quantity: number; reserved_quantity: number }>>`
          SELECT id, product_id, quantity, reserved_quantity
          FROM inventory
          WHERE product_id IN (${Prisma.join(productIds)})
          FOR UPDATE
        `;
        const byProduct = new Map(locked.map((r) => [r.product_id, r]));

        for (const item of items) {
          if (item.productId === null) continue;
          const row = byProduct.get(item.productId);
          if (!row) {
            this.logger.warn(`release skipped: inventory row missing for product ${item.productId}`);
            continue;
          }
          // Defensive clamp: never let reservedQuantity go negative.
          const release = Math.min(item.quantity, row.reserved_quantity);
          if (release > 0) {
            await tx.inventory.update({
              where: { id: row.id },
              data: { reservedQuantity: { decrement: release } },
            });
          }
          await tx.inventoryMovement.create({
            data: {
              inventoryId: row.id,
              type: 'RELEASE',
              quantity: -item.quantity,
              reason: 'ORDER_CANCELLED',
              referenceType: 'ORDER',
              referenceId: String(orderId),
              createdBy: actor.id,
            },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason ?? null,
        },
        select: ORDER_DETAIL_SELECT,
      });

      return {
        order: updated as unknown as OrderDetailRow,
        released: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderNumber: order.order_number,
        cancelledByStaff: actor.isStaff,
      };
    }, { timeout: 20000 });

    await this.audit.log({
      action: AUDIT.ORDER_CANCELLED,
      actorId: actor.id,
      entity: 'order',
      entityId: String(orderId),
      metadata: { orderNumber: outcome.orderNumber, reason: reason ?? null, byStaff: outcome.cancelledByStaff },
      ...meta,
    });
    await this.audit.log({
      action: AUDIT.ORDER_RESERVATION_RELEASED,
      actorId: actor.id,
      entity: 'order',
      entityId: String(orderId),
      metadata: { released: outcome.released },
      ...meta,
    });

    return this.serializeDetail(outcome.order);
  }

  /* ---------------------------- status workflow ---------------------------- */

  async updateStatus(
    orderId: number,
    dto: UpdateOrderStatusDto,
    actor: ActorRef,
    meta: RequestMeta = {},
  ) {
    if (dto.status === OrderStatus.CANCELLED) {
      // Reuse the cancellation pipeline: one implementation, one audit trail.
      return this.cancel(orderId, actor, dto.reason, meta);
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (order.status === dto.status) {
      throw new ConflictException(`الطلب في الحالة ${order.status} مسبقاً`);
    }
    if (!canTransition(order.status, dto.status)) {
      throw new ConflictException(`انتقال غير مسموح: ${order.status} → ${dto.status}`);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: dto.status },
      select: ORDER_DETAIL_SELECT,
    });

    await this.audit.log({
      action: AUDIT.ORDER_STATUS_UPDATED,
      actorId: actor.id,
      entity: 'order',
      entityId: String(orderId),
      metadata: { orderNumber: order.orderNumber, from: order.status, to: dto.status },
      ...meta,
    });

    return this.serializeDetail(updated as unknown as OrderDetailRow);
  }
}
