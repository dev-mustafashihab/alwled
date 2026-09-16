import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';

const dec = (v: string) => new Prisma.Decimal(v);

describe('DashboardService (read-only aggregations)', () => {
  let prisma: any;
  let service: DashboardService;

  const rawReturn = (rows: any[]) => jest.fn().mockResolvedValue(rows);

  beforeEach(() => {
    prisma = {
      user: { count: jest.fn().mockResolvedValue(0) },
      product: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      inventory: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { quantity: null, reservedQuantity: null }, _avg: { quantity: null, reservedQuantity: null } }),
      },
      inventoryMovement: { groupBy: jest.fn().mockResolvedValue([]) },
      order: {
        count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: {}, _avg: {}, _min: {}, _max: {} }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: {
        count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      customerVerification: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ count: BigInt(0) }]),
    };
    service = new DashboardService(prisma);
  });

  /** the whole point of this module: no write path exists */
  it('exposes no write operation on any model', () => {
    const forbidden = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', '$executeRaw', '$executeRawUnsafe'];
    for (const model of ['user', 'product', 'inventory', 'order', 'payment', 'customerVerification']) {
      for (const method of forbidden) {
        expect(`${model}.${method}:${typeof prisma[model]?.[method]}`).toBe(`${model}.${method}:undefined`);
      }
    }
  });

  it('overview: money is a string and available = quantity - reservedQuantity', async () => {
    prisma.user.count
      .mockResolvedValueOnce(100)  // total
      .mockResolvedValueOnce(95)   // active
      .mockResolvedValueOnce(3)    // suspended
      .mockResolvedValueOnce(2)    // deleted
      .mockResolvedValueOnce(90)   // customers
      .mockResolvedValueOnce(10);  // staff
    prisma.product.count.mockResolvedValueOnce(50).mockResolvedValueOnce(45).mockResolvedValueOnce(7);
    prisma.inventory.aggregate.mockResolvedValue({
      _count: { _all: 45 }, _sum: { quantity: 128, reservedQuantity: 13 },
      _avg: { quantity: 2, reservedQuantity: 0 },
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(7) }])   // low stock
      .mockResolvedValueOnce([{ count: BigInt(3) }]);  // out of stock
    prisma.order.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 20 } },
      { status: 'CONFIRMED', _count: { _all: 80 } },
      { status: 'CANCELLED', _count: { _all: 20 } },
    ]);
    prisma.payment.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 10 }, _sum: { amount: dec('100.00') } },
      { status: 'PENDING_REVIEW', _count: { _all: 5 }, _sum: { amount: dec('50.50') } },
      { status: 'SUCCEEDED', _count: { _all: 70 }, _sum: { amount: dec('10000.01') } },
      { status: 'FAILED', _count: { _all: 10 }, _sum: { amount: dec('10.10') } },
      { status: 'CANCELLED', _count: { _all: 5 }, _sum: { amount: dec('1.01') } },
    ]);
    prisma.customerVerification.groupBy.mockResolvedValue([
      { status: 'IN_REVIEW', _count: { _all: 2 } },
      { status: 'VERIFIED', _count: { _all: 3 } },
    ]);

    const result = await service.overview();
    expect(result.users).toMatchObject({ total: 100, customers: 90, staff: 10, active: 95, suspended: 3, deleted: 2 });
    expect(result.products).toMatchObject({ total: 50, active: 45, inactive: 5 });
    expect(result.inventory).toMatchObject({ totalQuantity: 128, totalReserved: 13, available: 115, lowStock: 7, outOfStock: 3 });
    expect(result.orders).toMatchObject({ total: 120, pending: 20, confirmed: 80, cancelled: 20 });
    expect(result.payments).toMatchObject({
      total: 100, pending: 10, pendingReview: 5, succeeded: 70, failed: 10, cancelled: 5,
      // collected money = SUCCEEDED only, as an exact decimal string
      succeededAmount: '10000.01',
    });
    // pending money = PENDING + PENDING_REVIEW + PROCESSING (decimal exact: 150.50)
    expect(result.payments.pendingAmount).toBe('150.50');
    expect(result.verifications).toMatchObject({ inReview: 2, verified: 3 });
  });

  it('orders analytics: keeps value per status and never floats money', async () => {
    prisma.order.groupBy.mockResolvedValue([
      { status: 'CONFIRMED', _count: { _all: 2 }, _sum: { total: dec('100.20') } },
      { status: 'CANCELLED', _count: { _all: 1 }, _sum: { total: dec('0.07') } },
    ]);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { total: dec('100.27') }, _avg: { total: dec('33.423333') },
      _min: { total: dec('0.07') }, _max: { total: dec('99.99') },
    });
    prisma.order.count.mockResolvedValue(3);

    const result = await service.ordersAnalytics({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-10T00:00:00.000Z' } as never);
    expect(result.total).toBe(3);
    expect(result.totalValue).toBe('100.27');
    expect(result.averageOrderValue).toBe('33.42'); // rounded once, by the decimal library
    expect(result.byStatus).toEqual([
      { status: 'CANCELLED', count: 1, orderValue: '0.07' },
      { status: 'CONFIRMED', count: 2, orderValue: '100.20' },
    ]);
    expect(typeof result.totalValue).toBe('string');
    const where = prisma.order.groupBy.mock.calls[0][0].where;
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    expect(where.createdAt.gt).toBeUndefined();
  });

  it('payments analytics: only SUCCEEDED counts as collected, manual Sham Cash is explicit', async () => {
    prisma.payment.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1); // total + awaiting review
    prisma.payment.groupBy
      .mockResolvedValueOnce([
        { status: 'PENDING', _count: { _all: 1 }, _sum: { amount: dec('399.98') } },
        { status: 'PENDING_REVIEW', _count: { _all: 1 }, _sum: { amount: dec('100.10') } },
        { status: 'SUCCEEDED', _count: { _all: 1 }, _sum: { amount: dec('0.01') } },
        { status: 'FAILED', _count: { _all: 1 }, _sum: { amount: dec('999999.99') } },
      ])
      .mockResolvedValueOnce([
        { status: 'SUCCEEDED', _count: { _all: 1 } },
        { status: 'FAILED', _count: { _all: 1 } },
      ]);

    const result = await service.paymentsAnalytics({} as never);
    expect(result.total).toBe(4);
    expect(result.succeededAmount).toBe('0.01');
    expect(result.succeededCount).toBe(1);
    expect(result.pendingAmount).toBe('399.98');
    expect(result.pendingReviewAmount).toBe('100.10');
    expect(result.failedAmount).toBe('999999.99');
    expect(result.shamCash).toMatchObject({
      manuallyConfirmedCount: 1, manuallyRejectedCount: 1, awaitingReviewCount: 1,
    });
    // the manual workflow must never be described as provider verification
    expect(result.shamCash.note).toContain('يدوي');
    expect(prisma.payment.groupBy.mock.calls[1][0].where.reviewedBy).toEqual({ not: null });
  });

  it('inventory analytics: available formula + per-record low-stock query, no user input in SQL', async () => {
    prisma.inventory.aggregate.mockResolvedValue({
      _count: { _all: 9 }, _sum: { quantity: 128, reservedQuantity: 13 },
      _avg: { quantity: 14.2, reservedQuantity: 1.4 },
    });
    prisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(4) }]).mockResolvedValueOnce([{ count: BigInt(2) }])
      .mockResolvedValueOnce([{ productId: 1, name: 'x', sku: 'S1', quantity: 5, reserved: 4, available: 1, threshold: 5 }]);
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      { type: 'RESERVATION', _count: { _all: 3 }, _sum: { quantity: 3 } },
    ]);

    const result = await service.inventoryAnalytics({ includeMovements: true } as never);
    expect(result).toMatchObject({ trackedProducts: 9, totalQuantity: 128, totalReserved: 13, available: 115, lowStock: 4, outOfStock: 2 });
    expect(result.definitions.available).toBe('quantity - reservedQuantity');
    expect(result.movements).toEqual([{ type: 'RESERVATION', count: 3, netQuantity: 3 }]);
    expect(result.lowStockProducts).toHaveLength(1);
  });

  it('rejects an inverted range with 400 instead of querying', async () => {
    await expect(service.ordersAnalytics({ from: '2026-09-10T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' } as never))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('payment review queue: PENDING_REVIEW only, proof location never returned', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'p1', orderId: 7, method: 'SHAM_CASH', amount: dec('399.98'), currency: 'USD',
        transactionReference: 'SC-1', proofUrl: 'https://internal.storage/secret-key.png',
        proofNote: 'حوالة', submittedAt: new Date('2026-09-16T00:00:00.000Z'), createdAt: new Date(),
        order: { orderNumber: 'ORD-2026-000001' },
      },
    ]);
    prisma.payment.count.mockResolvedValue(1);
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: dec('399.98') } });

    const result = await service.paymentReview({} as never);
    expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({ status: 'PENDING_REVIEW' });
    expect(result.items[0]).toMatchObject({ proofAttached: true, amount: '399.98', proofNote: 'حوالة' });
    expect(JSON.stringify(result)).not.toContain('internal.storage');
    expect(JSON.stringify(result)).not.toContain('proofUrl');
    expect(result.awaitingReviewAmount).toBe('399.98');
  });

  it('recent lists: bounded limit, whitelisted sort, minimal customer data', async () => {
    prisma.order.count.mockResolvedValue(100);
    prisma.order.findMany.mockResolvedValue([
      {
        id: 1, orderNumber: 'ORD-2026-000001', status: 'PENDING', total: dec('399.98'), currency: 'USD',
        createdAt: new Date(), items: [{ quantity: 2 }], user: { firstName: 'Ali', lastName: 'H' },
      },
    ]);
    const result = await service.recentOrders({ sortBy: 'createdAt', sortOrder: 'desc' } as never);
    const call = prisma.order.findMany.mock.calls[0][0];
    expect(call.take).toBe(10);
    expect(call.select.user.select).toEqual({ firstName: true, lastName: true });
    expect(result.items[0]).toMatchObject({ total: '399.98', itemCount: 2, customerName: 'Ali H' });
    expect(result.meta).toEqual({ page: 1, limit: 10, total: 100, totalPages: 10 });

    await service.recentOrders({ limit: 1_000_000, sortBy: 'createdAt', sortOrder: 'desc' } as never);
    expect(prisma.order.findMany.mock.calls[1][0].take).toBe(50);
  });
});
