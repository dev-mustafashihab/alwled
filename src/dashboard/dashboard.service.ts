import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { toMoneyString } from '../common/utils/money.util';
import {
  DASHBOARD_LIMITS, DashboardRangeError, ResolvedRange, clampLimit, rangeFilter, resolveRange,
} from './dashboard.constants';
import {
  InventoryAnalyticsQueryDto, OrdersAnalyticsQueryDto, PaymentReviewQueryDto,
  PaymentsAnalyticsQueryDto, RecentOrdersQueryDto, RecentPaymentsQueryDto,
  VerificationsAnalyticsQueryDto,
} from './dto/dashboard.dto';

/**
 * Group-by rows carry their own `_count._all` — count that, not the number of rows
 * (one row per status). Rows without `_count` (plain status lists) count as 1.
 */
const countBy = (rows: Array<{ status: string; _count?: { _all: number } }>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = (out[row.status] ?? 0) + (row._count?._all ?? 1);
  return out;
};

/**
 * Read-only dashboard aggregations (Stage 10).
 *
 * Rules enforced here:
 *  - every number comes from a database aggregation (COUNT/GROUP BY/SUM), never from
 *    loading rows into Node and reducing them;
 *  - amounts are aggregated by PostgreSQL NUMERIC and serialized as strings;
 *  - nothing in this service writes: no create/update/delete/execute calls exist.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private range(from?: string, to?: string): ResolvedRange {
    try {
      return resolveRange(from, to);
    } catch (error) {
      if (error instanceof DashboardRangeError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private rangeMeta(range: ResolvedRange) {
    return {
      from: range.fromIso, to: range.toIso, timezone: range.timezone,
      days: range.days, boundary: 'from inclusive / to exclusive',
    };
  }

  /* ------------------------------- overview -------------------------------- */

  /** All-time snapshot: business counters in one round of parallel aggregations. */
  async overview() {
    const [
      usersTotal, usersActive, usersSuspended, usersDeleted, customers, staff,
      productsTotal, productsActive, productsWithoutPrimaryImage,
      inventoryTotals, inventoryLowStock, inventoryOutOfStock,
      orderGroups, paymentGroups, verificationGroups,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { status: 'DELETED' } }),
      this.prisma.user.count({ where: { roles: { some: { role: { name: 'CUSTOMER' } } } } }),
      this.prisma.user.count({ where: { roles: { some: { role: { name: { not: 'CUSTOMER' } } } } } }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { images: { none: { isPrimary: true } } } }),
      this.prisma.inventory.aggregate({ _count: { _all: true }, _sum: { quantity: true, reservedQuantity: true } }),
      this.lowStockCount(),
      this.outOfStockCount(),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.payment.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.customerVerification.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const orders = countBy(orderGroups as Array<{ status: string }>);
    const payments = countBy(paymentGroups as Array<{ status: string }>);
    const verifications = countBy(verificationGroups as Array<{ status: string }>);
    const paymentAmount = (status: string) => {
      const row = (paymentGroups as Array<{ status: string; _sum: { amount: Prisma.Decimal | null } }>)
        .find((r) => r.status === status);
      return toMoneyString(row?._sum.amount ?? new Prisma.Decimal(0));
    };

    return {
      users: {
        total: usersTotal,
        customers,
        /** staff = users holding at least one non-CUSTOMER role */
        staff,
        active: usersActive,
        suspended: usersSuspended,
        deleted: usersDeleted,
      },
      products: {
        total: productsTotal,
        active: productsActive,
        inactive: productsTotal - productsActive,
        withoutPrimaryImage: productsWithoutPrimaryImage,
      },
      inventory: {
        trackedProducts: inventoryTotals._count._all,
        totalQuantity: inventoryTotals._sum.quantity ?? 0,
        totalReserved: inventoryTotals._sum.reservedQuantity ?? 0,
        available:
          (inventoryTotals._sum.quantity ?? 0) - (inventoryTotals._sum.reservedQuantity ?? 0),
        lowStock: inventoryLowStock,
        outOfStock: inventoryOutOfStock,
      },
      orders: {
        total: Object.values(orders).reduce((a, b) => a + b, 0),
        pending: orders.PENDING ?? 0,
        confirmed: orders.CONFIRMED ?? 0,
        cancelled: orders.CANCELLED ?? 0,
      },
      payments: {
        total: Object.values(payments).reduce((a, b) => a + b, 0),
        pending: payments.PENDING ?? 0,
        pendingReview: payments.PENDING_REVIEW ?? 0,
        processing: payments.PROCESSING ?? 0,
        succeeded: payments.SUCCEEDED ?? 0,
        failed: payments.FAILED ?? 0,
        cancelled: payments.CANCELLED ?? 0,
        /** Only SUCCEEDED money counts as collected. */
        succeededAmount: paymentAmount('SUCCEEDED'),
        pendingAmount: new Prisma.Decimal(paymentAmount('PENDING') ?? 0)
          .plus(paymentAmount('PENDING_REVIEW') ?? 0)
          .plus(paymentAmount('PROCESSING') ?? 0)
          .toFixed(2),
      },
      verifications: {
        total: Object.values(verifications).reduce((a, b) => a + b, 0),
        pending: verifications.PENDING ?? 0,
        inReview: verifications.IN_REVIEW ?? 0,
        verified: verifications.VERIFIED ?? 0,
        rejected: verifications.REJECTED ?? 0,
        expired: verifications.EXPIRED ?? 0,
        cancelled: verifications.CANCELLED ?? 0,
      },
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
    };
  }

  /* ------------------------- inventory helper counts ----------------------- */

  /**
   * available = quantity - reservedQuantity (the project's only formula).
   * low stock uses each record's own threshold (inventory.low_stock_threshold).
   * No user input reaches this SQL.
   */
  private async lowStockCount(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM inventory
      WHERE (quantity - reserved_quantity) <= low_stock_threshold`;
    return Number(rows[0]?.count ?? 0);
  }

  private async outOfStockCount(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM inventory
      WHERE (quantity - reserved_quantity) <= 0`;
    return Number(rows[0]?.count ?? 0);
  }

  /* --------------------------- orders analytics ---------------------------- */

  /** Order counts by status + value aggregations over a validated UTC range. */
  async ordersAnalytics(query: OrdersAnalyticsQueryDto) {
    const range = this.range(query.from, query.to);
    const where: Prisma.OrderWhereInput = {
      createdAt: rangeFilter(range),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.currency ? { currency: query.currency.toUpperCase() } : {}),
    };

    const [groups, aggregate, total] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.order.aggregate({
        where, _sum: { total: true }, _avg: { total: true }, _min: { total: true }, _max: { total: true },
      }),
      this.prisma.order.count({ where }),
    ]);

    const byStatus = (groups as Array<{ status: string; _count: { _all: number }; _sum: { total: Prisma.Decimal | null } }>)
      .map((row) => ({
        status: row.status,
        count: row._count._all,
        // value per status is reported separately: cancelled/pending orders are money too,
        // but they are NOT collected revenue — the naming says exactly that.
        orderValue: toMoneyString(row._sum.total ?? new Prisma.Decimal(0)),
      }))
      .sort((a, b) => a.status.localeCompare(b.status));

    return {
      range: this.rangeMeta(range),
      total,
      totalValue: toMoneyString(aggregate._sum.total ?? new Prisma.Decimal(0)),
      averageOrderValue: toMoneyString(aggregate._avg.total ?? new Prisma.Decimal(0)),
      minOrderValue: toMoneyString(aggregate._min.total ?? new Prisma.Decimal(0)),
      maxOrderValue: toMoneyString(aggregate._max.total ?? new Prisma.Decimal(0)),
      byStatus,
    };
  }

  /* -------------------------- payments analytics --------------------------- */

  /**
   * Payment counts and amounts by status.
   * SUCCEEDED is the only "collected" bucket. PENDING / PENDING_REVIEW / PROCESSING
   * are reported as pending money — never as sales.
   */
  async paymentsAnalytics(query: PaymentsAnalyticsQueryDto) {
    const range = this.range(query.from, query.to);
    // Scope shared by every metric here (status is applied only to the main breakdown so
    // the review-queue counters stay meaningful when the caller filters by status).
    const baseWhere: Prisma.PaymentWhereInput = {
      createdAt: rangeFilter(range),
      ...(query.method ? { method: query.method as never } : {}),
      ...(query.currency ? { currency: query.currency.toUpperCase() } : {}),
    };
    const where: Prisma.PaymentWhereInput = {
      ...baseWhere,
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [groups, total, manual, awaitingReview] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['status'], where, _count: { _all: true }, _sum: { amount: true },
      }),
      this.prisma.payment.count({ where }),
      // Sham Cash manual workflow: a human decision exists when reviewedBy is set.
      this.prisma.payment.groupBy({
        by: ['status'],
        where: { ...baseWhere, reviewedBy: { not: null } },
        _count: { _all: true },
      }),
      // The review queue is PENDING_REVIEW by definition — nobody reviewed it yet.
      this.prisma.payment.count({ where: { ...baseWhere, status: 'PENDING_REVIEW' } }),
    ]);

    const rows = groups as Array<{ status: string; _count: { _all: number }; _sum: { amount: Prisma.Decimal | null } }>;
    const amountOf = (statuses: string[]): Prisma.Decimal =>
      rows.filter((r) => statuses.includes(r.status))
        .reduce((acc, r) => acc.plus(r._sum.amount ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
    const countOf = (statuses: string[]): number =>
      rows.filter((r) => statuses.includes(r.status)).reduce((acc, r) => acc + r._count._all, 0);

    const manualCounts = countBy(manual as Array<{ status: string }>);

    return {
      range: this.rangeMeta(range),
      total,
      byStatus: rows
        .map((r) => ({
          status: r.status,
          count: r._count._all,
          amount: toMoneyString(r._sum.amount ?? new Prisma.Decimal(0)),
        }))
        .sort((a, b) => a.status.localeCompare(b.status)),
      succeededCount: countOf(['SUCCEEDED']),
      /** Collected money — SUCCEEDED only. */
      succeededAmount: toMoneyString(amountOf(['SUCCEEDED'])),
      pendingCount: countOf(['PENDING', 'PROCESSING']),
      pendingAmount: toMoneyString(amountOf(['PENDING', 'PROCESSING'])),
      pendingReviewCount: countOf(['PENDING_REVIEW']),
      pendingReviewAmount: toMoneyString(amountOf(['PENDING_REVIEW'])),
      failedCount: countOf(['FAILED']),
      failedAmount: toMoneyString(amountOf(['FAILED'])),
      cancelledCount: countOf(['CANCELLED']),
      cancelledAmount: toMoneyString(amountOf(['CANCELLED'])),
      shamCash: {
        /**
         * Manual workflow vocabulary: these were confirmed/rejected by an employee
         * (Stage 8), NOT verified by a payment provider.
         */
        manuallyConfirmedCount: manualCounts.SUCCEEDED ?? 0,
        manuallyRejectedCount: manualCounts.FAILED ?? 0,
        awaitingReviewCount: awaitingReview,
        note: 'Stage 8 هو تأكيد موظف يدوي — لا يمثل تأكيداً من مزوّد دفع',
      },
    };
  }

  /* -------------------------- inventory analytics -------------------------- */

  /** available = quantity - reservedQuantity; low stock uses each record's threshold. */
  async inventoryAnalytics(query: InventoryAnalyticsQueryDto) {
    const [totals, lowStock, outOfStock, lowStockSample, movements] = await Promise.all([
      this.prisma.inventory.aggregate({
        _count: { _all: true },
        _sum: { quantity: true, reservedQuantity: true },
        _avg: { quantity: true, reservedQuantity: true },
      }),
      this.lowStockCount(),
      this.outOfStockCount(),
      this.lowStockProducts(),
      query.includeMovements
        ? this.prisma.inventoryMovement.groupBy({
            by: ['type'],
            _count: { _all: true },
            _sum: { quantity: true },
          })
        : Promise.resolve([]),
    ]);

    const totalQuantity = totals._sum.quantity ?? 0;
    const totalReserved = totals._sum.reservedQuantity ?? 0;

    return {
      trackedProducts: totals._count._all,
      totalQuantity,
      totalReserved,
      available: totalQuantity - totalReserved,
      averageQuantity: Number(totals._avg.quantity ?? 0),
      lowStock,
      outOfStock,
      /** definition is explicit so the frontend cannot guess a different rule */
      definitions: {
        available: 'quantity - reservedQuantity',
        lowStock: 'available <= inventory.lowStockThreshold (لكل سجل)',
        outOfStock: 'available <= 0',
      },
      lowStockProducts: lowStockSample,
      movements: query.includeMovements
        ? (movements as Array<{ type: string; _count: { _all: number }; _sum: { quantity: number | null } }>)
            .map((m) => ({ type: m.type, count: m._count._all, netQuantity: m._sum.quantity ?? 0 }))
            .sort((a, b) => a.type.localeCompare(b.type))
        : undefined,
    };
  }

  /** Bounded low-stock list (top-N by how far below the threshold the record sits). */
  private async lowStockProducts() {
    const rows = await this.prisma.$queryRaw<
      Array<{ productId: number; name: string; sku: string; quantity: number; reserved: number; available: number; threshold: number }>
    >`
      SELECT i.product_id AS "productId", p.name, p.sku,
             i.quantity, i.reserved_quantity AS reserved,
             (i.quantity - i.reserved_quantity) AS available,
             i.low_stock_threshold AS threshold
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE (i.quantity - i.reserved_quantity) <= i.low_stock_threshold
      ORDER BY (i.quantity - i.reserved_quantity) ASC, i.product_id ASC
      LIMIT ${DASHBOARD_LIMITS.lowStockSample}`;
    return rows;
  }

  /* ------------------------ verification analytics ------------------------- */

  /**
   * Customer-verification counters. Statuses are reported exactly as stored; the
   * verification domain applies lazy expiry when a record is read — analytics never
   * mutates a record to count it.
   */
  async verificationsAnalytics(query: VerificationsAnalyticsQueryDto) {
    const range = this.range(query.from, query.to);
    const where: Prisma.CustomerVerificationWhereInput = { createdAt: rangeFilter(range) };

    const [groups, activeExpired] = await Promise.all([
      this.prisma.customerVerification.groupBy({ by: ['status'], where, _count: { _all: true } }),
      // visibility only: how many ACTIVE requests are already past their deadline
      this.prisma.customerVerification.count({
        where: { ...where, status: { in: ['PENDING', 'IN_REVIEW'] }, expiresAt: { lt: new Date() } },
      }),
    ]);

    const counts = countBy(groups as Array<{ status: string }>);
    return {
      range: this.rangeMeta(range),
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      byStatus: Object.entries(counts)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => a.status.localeCompare(b.status)),
      pending: counts.PENDING ?? 0,
      /** the review queue metric the admin actually works from */
      inReview: counts.IN_REVIEW ?? 0,
      verified: counts.VERIFIED ?? 0,
      rejected: counts.REJECTED ?? 0,
      expired: counts.EXPIRED ?? 0,
      cancelled: counts.CANCELLED ?? 0,
      activePastDeadline: activeExpired,
      note: 'غير مرتبط بالدفعات — التحقق نطاق مستقل',
    };
  }

  /* --------------------------- catalog analytics --------------------------- */

  /** Product counters + per-category/per-brand breakdowns (SQL GROUP BY, top N). */
  async catalogAnalytics() {
    const [
      total, active, featured, withoutPrimaryImage, withImages, withInventory,
      categoryGroups, brandGroups,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { isFeatured: true } }),
      this.prisma.product.count({ where: { images: { none: { isPrimary: true } } } }),
      this.prisma.product.count({ where: { images: { some: {} } } }),
      this.prisma.product.count({ where: { inventory: { isNot: null } } }),
      this.prisma.product.groupBy({
        by: ['categoryId'], _count: { _all: true }, orderBy: { _count: { categoryId: 'desc' } },
        take: DASHBOARD_LIMITS.topGroups,
      }),
      this.prisma.product.groupBy({
        by: ['brandId'], _count: { _all: true }, orderBy: { _count: { brandId: 'desc' } },
        take: DASHBOARD_LIMITS.topGroups,
      }),
    ]);

    const [categories, brands] = await Promise.all([
      this.prisma.category.findMany({
        where: { id: { in: (categoryGroups as Array<{ categoryId: number }>).map((g) => g.categoryId) } },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.brand.findMany({
        where: { id: { in: (brandGroups as Array<{ brandId: number }>).map((g) => g.brandId) } },
        select: { id: true, name: true, slug: true },
      }),
    ]);

    const label = <T extends { id: number; name: string; slug: string }>(rows: T[], id: number) =>
      rows.find((r) => r.id === id) ?? { name: null, slug: null };

    return {
      products: {
        total,
        active,
        inactive: total - active,
        featured,
        withImages,
        withoutImages: total - withImages,
        withoutPrimaryImage,
        withInventory,
        withoutInventory: total - withInventory,
      },
      topCategories: (categoryGroups as Array<{ categoryId: number; _count: { _all: number } }>)
        .map((g) => ({
          categoryId: g.categoryId, name: label(categories, g.categoryId).name,
          slug: label(categories, g.categoryId).slug, products: g._count._all,
        })),
      topBrands: (brandGroups as Array<{ brandId: number; _count: { _all: number } }>)
        .map((g) => ({
          brandId: g.brandId, name: label(brands, g.brandId).name,
          slug: label(brands, g.brandId).slug, products: g._count._all,
        })),
    };
  }

  /* ----------------------------- bounded lists ----------------------------- */

  /** Recent orders: bounded, minimal fields, display name only (no e-mail/phone). */
  async recentOrders(query: RecentOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = clampLimit(query.limit);
    const where: Prisma.OrderWhereInput = query.status ? { status: query.status as never } : {};
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.OrderOrderByWithRelationInput;

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [orderBy, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, orderNumber: true, status: true, total: true, currency: true, createdAt: true,
          items: { select: { quantity: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        total: toMoneyString(row.total),
        currency: row.currency,
        itemCount: row.items.reduce((acc, item) => acc + item.quantity, 0),
        customerName: `${row.user.firstName} ${row.user.lastName}`.trim(),
        createdAt: row.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /**
   * Recent payments. Deliberately excludes proofUrl / providerPaymentId /
   * reviewedBy: the dashboard never exposes storage locations or provider ids.
   */
  async recentPayments(query: RecentPaymentsQueryDto) {
    const page = query.page ?? 1;
    const limit = clampLimit(query.limit);
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
    };
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.PaymentOrderByWithRelationInput;

    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: [orderBy, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, orderId: true, method: true, status: true, amount: true, currency: true,
          createdAt: true, submittedAt: true, reviewedAt: true, transactionReference: true,
          order: { select: { orderNumber: true } },
        },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        method: row.method,
        status: row.status,
        amount: toMoneyString(row.amount),
        currency: row.currency,
        transactionReference: row.transactionReference,
        createdAt: row.createdAt,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
      })),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /**
   * Sham Cash manual review queue — always PENDING_REVIEW, never a generic list.
   * The proof itself stays behind the existing payments endpoints: only its
   * presence/note is reported here, never the stored URL.
   */
  async paymentReview(query: PaymentReviewQueryDto) {
    const page = query.page ?? 1;
    const limit = clampLimit(query.limit);
    const where: Prisma.PaymentWhereInput = { status: 'PENDING_REVIEW' };
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.PaymentOrderByWithRelationInput;

    const [total, rows, awaitingTotal] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: [orderBy, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, orderId: true, method: true, amount: true, currency: true,
          transactionReference: true, proofUrl: true, proofNote: true,
          submittedAt: true, createdAt: true,
          order: { select: { orderNumber: true } },
        },
      }),
      this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        method: row.method,
        amount: toMoneyString(row.amount),
        currency: row.currency,
        transactionReference: row.transactionReference,
        /** metadata only — the URL/storage location is not exposed here */
        proofAttached: Boolean(row.proofUrl),
        proofNote: row.proofNote,
        submittedAt: row.submittedAt,
        createdAt: row.createdAt,
      })),
      awaitingReviewTotal: total,
      awaitingReviewAmount: toMoneyString(awaitingTotal._sum.amount ?? new Prisma.Decimal(0)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      timezone: 'UTC',
    };
  }
}
