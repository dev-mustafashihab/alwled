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
  // URL-only storage stub: proof URLs are validated by the storage abstraction.
  const storage = { name: 'url', put: jest.fn().mockImplementation(async (url: string) => ({ url, provider: 'url' })) };
  const service = new PaymentsService(prisma as never, audit as never, storage as never);
  return { service, prisma, tx, audit, storage, paymentCreate, paymentUpdate, inventoryUpdate, inventoryMovementCreate };
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

  describe('manual Sham Cash flow', () => {
    const proof = { transactionReference: 'sc-2026-0098231', proofUrl: 'https://cdn.example.com/proof.webp', proofNote: 'حوّلت المبلغ' };

    it('moves PENDING → PENDING_REVIEW with reference, proof and timestamp, and audits it', async () => {
      const { service, paymentUpdate, audit, storage } = build({ currentStatus: 'PENDING' });
      const result = (await service.submitProof('pay-1', 'user-a', proof)) as unknown as { status: string };

      expect(storage.put).toHaveBeenCalledWith(proof.proofUrl);
      expect(paymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING_REVIEW',
            transactionReference: 'SC-2026-0098231',
            proofUrl: proof.proofUrl,
            proofNote: 'حوّلت المبلغ',
          }),
        }),
      );
      expect(result.status).toBe('PENDING_REVIEW');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_SUBMITTED_FOR_REVIEW',
          actorId: 'user-a',
          metadata: expect.objectContaining({ status: 'PENDING_REVIEW', source: 'CUSTOMER' }),
        }),
      );
    });

    it('never touches inventory while declaring or deciding a transfer', async () => {
      const { service, inventoryUpdate, inventoryMovementCreate } = build({ currentStatus: 'PENDING' });
      await service.submitProof('pay-1', 'user-a', proof);
      expect(inventoryUpdate).not.toHaveBeenCalled();
      expect(inventoryMovementCreate).not.toHaveBeenCalled();
    });

    it('404s when the payment is not the caller\'s', async () => {
      const { service, prisma } = build();
      prisma.payment.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.submitProof('pay-9', 'user-b', proof)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a second submission while one is already under review', async () => {
      const { service, prisma } = build();
      prisma.payment.findFirst = jest.fn().mockResolvedValue(paymentRow({ status: 'PENDING_REVIEW' }));
      await expect(service.submitProof('pay-1', 'user-a', proof)).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a reference already used by another payment', async () => {
      const { service, prisma } = build();
      prisma.payment.findUnique = jest.fn().mockResolvedValue({ id: 'other-payment' });
      await expect(service.submitProof('pay-1', 'user-a', proof)).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates storage validation errors for a bad proof URL', async () => {
      const { service, storage } = build({ currentStatus: 'PENDING' });
      storage.put.mockRejectedValueOnce(new Error('رابط غير صالح'));
      await expect(service.submitProof('pay-1', 'user-a', proof)).rejects.toThrow('رابط غير صالح');
    });

    it('confirm: PENDING_REVIEW → SUCCEEDED with reviewer metadata and audit', async () => {
      const { service, prisma, tx, audit } = build({ currentStatus: 'PENDING_REVIEW' });
      prisma.payment.findUnique = jest.fn().mockResolvedValue(
        paymentRow({ status: 'PENDING_REVIEW', transactionReference: 'SC-1' }),
      );
      tx.$queryRaw.mockResolvedValue([{ id: 'pay-1', status: 'PENDING_REVIEW', order_id: 77 }]);

      const result = (await service.confirm('pay-1', { id: 'admin-1', isStaff: true })) as unknown as { status: string };
      expect(result.status).toBe('SUCCEEDED');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_CONFIRMED', actorId: 'admin-1', metadata: expect.objectContaining({ source: 'ADMIN' }) }),
      );
    });

    it('confirm: refuses when the payment is not under review', async () => {
      const { service, prisma } = build();
      prisma.payment.findUnique = jest.fn().mockResolvedValue(paymentRow({ status: 'PENDING' }));
      await expect(service.confirm('pay-1', { id: 'admin-1', isStaff: true })).rejects.toBeInstanceOf(ConflictException);
    });

    it('confirm: refuses a review with no transaction reference', async () => {
      const { service, prisma } = build();
      prisma.payment.findUnique = jest.fn().mockResolvedValue(
        paymentRow({ status: 'PENDING_REVIEW', transactionReference: null }),
      );
      await expect(service.confirm('pay-1', { id: 'admin-1', isStaff: true })).rejects.toBeInstanceOf(ConflictException);
    });

    it('reject: PENDING_REVIEW → FAILED with the mandatory reason', async () => {
      const { service, prisma, tx, audit } = build({ currentStatus: 'PENDING_REVIEW' });
      prisma.payment.findUnique = jest.fn().mockResolvedValue(paymentRow({ status: 'PENDING_REVIEW' }));
      tx.$queryRaw.mockResolvedValue([{ id: 'pay-1', status: 'PENDING_REVIEW', order_id: 77 }]);

      const result = (await service.reject('pay-1', { id: 'admin-1', isStaff: true }, 'رقم غير مطابق')) as unknown as { status: string };
      expect(result.status).toBe('FAILED');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_REJECTED', metadata: expect.objectContaining({ reason: 'رقم غير مطابق' }) }),
      );
    });

    it('reject: refuses a payment that is not under review', async () => {
      const { service, prisma } = build();
      prisma.payment.findUnique = jest.fn().mockResolvedValue(paymentRow({ status: 'SUCCEEDED' }));
      await expect(service.reject('pay-1', { id: 'admin-1', isStaff: true }, 'سبب')).rejects.toBeInstanceOf(ConflictException);
    });

    it('exposes the receiving account from configuration without inventing data', () => {
      const { service } = build();
      delete process.env.SHAMCASH_WALLET_NUMBER;
      delete process.env.SHAMCASH_ACCOUNT_NAME;
      const unconfigured = service.getShamCashAccount();
      expect(unconfigured.configured).toBe(false);
      expect(unconfigured.walletNumber).toBeNull();

      process.env.SHAMCASH_WALLET_NUMBER = '0999-000-000';
      process.env.SHAMCASH_ACCOUNT_NAME = 'Alwled Store';
      const configured = service.getShamCashAccount();
      expect(configured).toMatchObject({
        configured: true, walletNumber: '0999-000-000', accountName: 'Alwled Store', method: 'SHAM_CASH',
      });
      delete process.env.SHAMCASH_WALLET_NUMBER;
      delete process.env.SHAMCASH_ACCOUNT_NAME;
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
