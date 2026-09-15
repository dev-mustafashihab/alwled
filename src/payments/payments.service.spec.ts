import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PAYMENT_STATUS } from './payments.constants';

/**
 * Service-level guarantees: server-controlled financial fields, ownership,
 * order eligibility, one payment per order, idempotent replay and a strictly
 * enforced state machine (including the "no fake success" boundary).
 */
const orderRow = (over: Record<string, unknown> = {}) => ({
  id: 77,
  userId: 'user-a',
  status: 'PENDING',
  total: new Prisma.Decimal('400.19'),
  currency: 'USD',
  orderNumber: 'ORD-2026-000077',
  ...over,
});

const paymentRow = (over: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  orderId: 77,
  userId: 'user-a',
  method: 'SHAM_CASH',
  status: 'PENDING',
  amount: new Prisma.Decimal('400.19'),
  currency: 'USD',
  provider: null,
  providerPaymentId: null,
  createdAt: new Date('2026-09-15T10:00:00Z'),
  updatedAt: new Date('2026-09-15T10:00:00Z'),
  ...over,
});

const build = (options: {
  order?: unknown;
  idempotency?: unknown;
  createError?: unknown;
  currentStatus?: string;
} = {}) => {
  const paymentCreate = jest.fn().mockResolvedValue(paymentRow());
  const paymentUpdate = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    paymentRow({ status: data.status ?? options.currentStatus ?? 'PENDING', ...data }));
  const inventoryUpdate = jest.fn();
  const inventoryMovementCreate = jest.fn();
  const idemCreate = jest.fn().mockResolvedValue({ id: 'idem-1' });
  const idemUpdate = jest.fn().mockResolvedValue({ id: 'idem-1' });

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'pay-1', status: options.currentStatus ?? 'PENDING', order_id: 77 }]),
    payment: { create: paymentCreate, update: paymentUpdate },
    idempotencyKey: { create: idemCreate, update: idemUpdate },
    inventory: { update: inventoryUpdate },
    inventoryMovement: { create: inventoryMovementCreate },
  };

  const prisma = {
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    order: { findFirst: jest.fn().mockResolvedValue(options.order === undefined ? orderRow() : options.order) },
    payment: {
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(paymentRow()),
      findFirst: jest.fn().mockResolvedValue(paymentRow()),
    },
    idempotencyKey: {
      findUnique: jest.fn().mockResolvedValue(options.idempotency ?? null),
    },
  };
  if (options.createError) paymentCreate.mockRejectedValue(options.createError);

  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentsService(prisma as never, audit as never);
  return { service, prisma, tx, audit, paymentCreate, paymentUpdate, inventoryUpdate, inventoryMovementCreate };
};

const dto = { orderId: 77 };

describe('PaymentsService', () => {
  describe('create', () => {
    it('takes amount and currency from the Order, starts PENDING and never trusts the client', async () => {
      const { service, paymentCreate, audit } = build();
      const result = await service.create('user-a', 'key-1', dto);

      expect(paymentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: new Prisma.Decimal('400.19'),
            currency: 'USD',
            status: 'PENDING',
            userId: 'user-a',
            orderId: 77,
            method: 'SHAM_CASH',
            provider: null,
            providerPaymentId: null,
          }),
        }),
      );
      expect(result.replayed).toBe(false);
      expect((result.payment as { amount: string }).amount).toBe('400.19');
      expect((result.payment as { status: string }).status).toBe('PENDING');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_CREATED', actorId: 'user-a' }),
      );
    });

    it('never touches inventory (reservation belongs to order creation)', async () => {
      const { service, inventoryUpdate, inventoryMovementCreate } = build();
      await service.create('user-a', 'key-1', dto);
      expect(inventoryUpdate).not.toHaveBeenCalled();
      expect(inventoryMovementCreate).not.toHaveBeenCalled();
    });

    it('404s when the order belongs to another customer (no existence leak)', async () => {
      const { service, paymentCreate } = build({ order: null });
      await expect(service.create('user-b', 'key-1', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('rejects a cancelled order with 409', async () => {
      const { service } = build({ order: orderRow({ status: 'CANCELLED' }) });
      await expect(service.create('user-a', 'key-1', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a second payment for the same order (unique orderId)', async () => {
      const { service } = build({
        createError: new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['order_id'] },
        }),
      });
      await expect(service.create('user-a', 'key-1', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('requires an idempotency key', async () => {
      const { service } = build();
      await expect(service.create('user-a', '  ', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('replays the original payment for the same key and request', async () => {
      const { service, paymentCreate } = build({
        idempotency: { requestHash: require('crypto').createHash('sha256').update(JSON.stringify({ orderId: 77 })).digest('hex'), paymentId: 'pay-1' },
      });
      const result = await service.create('user-a', 'key-1', dto);
      expect(result.replayed).toBe(true);
      expect((result.payment as { id: string }).id).toBe('pay-1');
      expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('rejects the same key used with a different order', async () => {
      const { service } = build({ idempotency: { requestHash: 'different-hash', paymentId: 'pay-1' } });
      await expect(service.create('user-a', 'key-1', dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('transition (internal domain operation)', () => {
    it('allows PENDING → PROCESSING', async () => {
      const { service } = build({ currentStatus: 'PENDING' });
      const result = await service.transition('pay-1', PAYMENT_STATUS.PROCESSING, { actorId: 'system', source: 'SYSTEM' });
      expect((result as { status: string }).status).toBe('PROCESSING');
    });

    it('refuses PENDING → SUCCEEDED (no unverified success)', async () => {
      const { service, paymentUpdate } = build({ currentStatus: 'PENDING' });
      await expect(
        service.transition('pay-1', PAYMENT_STATUS.SUCCEEDED, { actorId: 'system', source: 'SYSTEM' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(paymentUpdate).not.toHaveBeenCalled();
    });

    it('refuses transitions out of terminal states', async () => {
      const { service } = build({ currentStatus: 'SUCCEEDED' });
      await expect(
        service.transition('pay-1', PAYMENT_STATUS.CANCELLED, { actorId: 'admin', source: 'ADMIN' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s for an unknown payment', async () => {
      const { service, tx } = build();
      tx.$queryRaw.mockResolvedValueOnce([]);
      await expect(
        service.transition('missing', PAYMENT_STATUS.PROCESSING, { actorId: 'system', source: 'SYSTEM' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('records an audit entry that carries no secrets', async () => {
      const { service, audit } = build({ currentStatus: 'PENDING' });
      await service.transition('pay-1', PAYMENT_STATUS.CANCELLED, { actorId: 'admin-1', source: 'ADMIN' });
      const call = audit.log.mock.calls[0][0];
      expect(call.action).toBe('PAYMENT_CANCELLED');
      const raw = JSON.stringify(call);
      ['passwordHash', 'tokenHash', 'Authorization', 'apiKey', 'secret'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
    });
  });

  describe('cancel', () => {
    it('cancels a PENDING payment', async () => {
      const { service } = build({ currentStatus: 'PENDING' });
      const result = (await service.cancel('pay-1', { id: 'admin-1', isStaff: true }, 'طلب العميل')) as unknown as {
        status: string; cancellationReason: string | null;
      };
      expect(result.status).toBe('CANCELLED');
      expect(result.cancellationReason).toBe('طلب العميل');
    });

    it('refuses to cancel a SUCCEEDED payment', async () => {
      const { service, prisma } = build();
      prisma.payment.findUnique = jest.fn().mockResolvedValue(paymentRow({ status: 'SUCCEEDED' }));
      await expect(service.cancel('pay-1', { id: 'admin-1', isStaff: true }, undefined))
        .rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to cancel a payment already bound to a provider', async () => {
      const { service, prisma } = build();
      prisma.payment.findUnique = jest.fn().mockResolvedValue(
        paymentRow({ status: 'PENDING', providerPaymentId: 'PROVIDER-123' }),
      );
      await expect(service.cancel('pay-1', { id: 'admin-1', isStaff: true }, undefined))
        .rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('ownership', () => {
    it('scopes customer reads to the caller', async () => {
      const { service, prisma } = build();
      await service.findOne('pay-1', { id: 'user-a', isStaff: false });
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-1', userId: 'user-a' } }),
      );
    });

    it('lets staff with payments.read read any payment', async () => {
      const { service, prisma } = build();
      await service.findOne('pay-1', { id: 'admin-1', isStaff: true });
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-1' } }),
      );
    });

    it('404s when the payment is not visible to the caller', async () => {
      const { service, prisma } = build();
      prisma.payment.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('pay-9', { id: 'user-b', isStaff: false }))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
