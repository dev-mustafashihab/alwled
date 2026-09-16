import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomerVerificationService } from './customer-verification.service';
import { VerificationProviderRegistry } from './providers/verification-provider.registry';
import { LogCustomerVerificationProvider } from './providers/log-verification.provider';
import { ListVerificationsQueryDto } from './dto/verification.dto';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'cv1',
  userId: 'u1',
  status: 'PENDING',
  provider: 'LOG',
  providerReference: 'LOG-cv1-A1',
  source: 'SYSTEM',
  attempt: 1,
  startedAt: new Date('2026-01-01T00:00:00Z'),
  submittedAt: new Date('2026-01-01T00:00:00Z'),
  completedAt: null,
  expiresAt: new Date(Date.now() + 3_600_000),
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const p2002 = (target = 'customer_verifications') =>
  new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5', meta: { target } });

describe('CustomerVerificationService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  const notifications = { enqueue: jest.fn(), dispatch: jest.fn(), dispatchSafely: jest.fn() };
  let provider: LogCustomerVerificationProvider & { startVerification: jest.Mock; cancelVerification: jest.Mock };
  let service: CustomerVerificationService;
  /** Stateful fake row so create/update behave like the database. */
  let stored: ReturnType<typeof row> | null = null;
  const setStored = (value: ReturnType<typeof row> | null) => { stored = value; };

  beforeEach(() => {
    stored = null;
    prisma = {
      customerVerification: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        create: jest.fn().mockImplementation(({ data }: any) => {
          stored = row({ ...data }) as never;
          return Promise.resolve(stored);
        }),
        update: jest.fn().mockImplementation(({ data }: any) => {
          stored = row({ ...(stored ?? {}), ...data }) as never;
          return Promise.resolve(stored);
        }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      idempotencyKey: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      // supports both forms used by the service: array (batch) and callback (atomic work)
      $transaction: jest.fn().mockImplementation((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (t: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[])),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const log = new LogCustomerVerificationProvider();
    provider = {
      ...log,
      startVerification: jest.fn(log.startVerification.bind(log)),
      cancelVerification: jest.fn(log.cancelVerification.bind(log)),
    } as typeof provider;
    const registry = { provider, name: 'LOG', isExternal: false } as unknown as VerificationProviderRegistry;
    service = new CustomerVerificationService(prisma, audit as never, notifications as never, registry);
  });

  const actions = () => audit.log.mock.calls.map((c) => c[0].action);

  /* --------------------------------- reads --------------------------------- */

  describe('getMine', () => {
    it('returns the virtual NOT_STARTED state when nothing was ever started', async () => {
      const result = await service.getMine('u1');
      expect(result).toMatchObject({
        id: null, status: 'NOT_STARTED', canStart: true, canCancel: false, isVerified: false,
        providerConfigured: 'LOG', externalProvider: false,
      });
      expect(prisma.customerVerification.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('returns the stored active request and offers cancel', async () => {
      setStored(row());
      const result = await service.getMine('u1');
      expect(result).toMatchObject({ id: 'cv1', status: 'PENDING', canCancel: true, canStart: false, isVerified: false });
    });

    it('a stored row never implies success', async () => {
      setStored(row({ status: 'IN_REVIEW' }));
      expect((await service.getMine('u1')).isVerified).toBe(false);
      setStored(row({ status: 'VERIFIED', completedAt: new Date() }));
      expect((await service.getMine('u1')).isVerified).toBe(true);
    });

    it('persists lazy expiry for an active row past its deadline and audits it', async () => {
      prisma.customerVerification.findFirst.mockResolvedValue(
        row({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const result = await service.getMine('u1');
      expect(result.status).toBe('EXPIRED');
      expect(prisma.customerVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cv1' }, data: expect.objectContaining({ status: 'EXPIRED' }) }),
      );
      expect(actions()).toContain('VERIFICATION_EXPIRED');
    });

    it('does not touch a finished row whose deadline passed', async () => {
      prisma.customerVerification.findFirst.mockResolvedValue(
        row({ status: 'REJECTED', expiresAt: new Date(Date.now() - 1000) }),
      );
      expect((await service.getMine('u1')).status).toBe('REJECTED');
      expect(prisma.customerVerification.update).not.toHaveBeenCalled();
    });
  });

  it('findOneForCustomer hides another user\'s record as 404', async () => {
    setStored(null);
    await expect(service.findOneForCustomer('cv1', 'u2')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customerVerification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cv1', userId: 'u2' } }),
    );
  });

  describe('adminList', () => {
    it('paginates and filters', async () => {
      prisma.customerVerification.count.mockResolvedValue(1);
      prisma.customerVerification.findMany.mockResolvedValue([row()]);
      const result = await service.adminList({ page: 1, limit: 20, status: 'PENDING', sortBy: 'createdAt', sortOrder: 'desc' } as ListVerificationsQueryDto);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(result.items).toHaveLength(1);
    });

    it('404s for an unknown id', async () => {
      await expect(service.adminFindOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /* --------------------------------- start --------------------------------- */

  describe('start', () => {
    const dto = { locale: 'ar' };

    it('creates a PENDING request, stores the provider reference and audits both events', async () => {
      const { verification } = await service.start('u1', 'k1', dto, {});
      expect(verification).toMatchObject({
        status: 'PENDING', provider: 'LOG', providerReference: 'LOG-cv1-A1', attempt: 1, isVerified: false,
      });
      expect(provider.startVerification).toHaveBeenCalledWith(
        expect.objectContaining({ verificationId: 'cv1', userId: 'u1', attempt: 1 }),
      );
      expect(actions()).toEqual(['VERIFICATION_STARTED', 'VERIFICATION_SUBMITTED']);
      expect(prisma.idempotencyKey.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ scope: 'VERIFICATION', verificationId: 'cv1' }) }),
      );
    });

    it('replays the same record for the same key and payload', async () => {
      prisma.idempotencyKey.findUnique.mockResolvedValue({
        requestHash: require('crypto').createHash('sha256')
          .update(JSON.stringify({ action: 'verification.start', locale: 'ar' })).digest('hex'),
        verificationId: 'cv1',
      });
      setStored(row());
      const result = await service.start('u1', 'k1', dto, {});
      expect(result.replayed).toBe(true);
      expect(result.verification.id).toBe('cv1');
      expect(prisma.customerVerification.create).not.toHaveBeenCalled();
      expect(provider.startVerification).not.toHaveBeenCalled();
    });

    it('rejects the same key with a different payload', async () => {
      prisma.idempotencyKey.findUnique.mockResolvedValue({ requestHash: 'other', verificationId: 'cv1' });
      await expect(service.start('u1', 'k1', { locale: 'en' }, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('requires an idempotency key', async () => {
      await expect(service.start('u1', '', dto, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a second request while one is active', async () => {
      setStored(row({ status: 'IN_REVIEW' }));
      await expect(service.start('u1', 'k2', dto, {})).rejects.toThrow(/قيد المعالجة/);
    });

    it('allows a retry after REJECTED and resets the review fields', async () => {
      prisma.customerVerification.findFirst.mockResolvedValue(
        row({ status: 'REJECTED', attempt: 1, completedAt: new Date(), rejectionReason: 'blurry', reviewedBy: 'emp1', reviewedAt: new Date() }),
      );
      const { verification } = await service.start('u1', 'k3', dto, {});
      expect(verification).toMatchObject({ status: 'PENDING', attempt: 2, rejectionReason: null });
      expect(prisma.customerVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', completedAt: null, reviewedBy: null, reviewedAt: null }),
        }),
      );
    });

    it('allows a retry after EXPIRED', async () => {
      setStored(row({ status: 'EXPIRED', attempt: 2, completedAt: new Date() }));
      const { verification } = await service.start('u1', 'k4', dto, {});
      expect(verification).toMatchObject({ status: 'PENDING', attempt: 3 });
    });

    it('refuses a verified account, and never downgrades it', async () => {
      setStored(row({ status: 'VERIFIED', completedAt: new Date() }));
      await expect(service.start('u1', 'k5', dto, {})).rejects.toThrow(/موثَّق/);
      expect(prisma.customerVerification.update).not.toHaveBeenCalled();
    });

    it('refuses to restart a cancelled request (CANCELLED is terminal)', async () => {
      setStored(row({ status: 'CANCELLED', completedAt: new Date() }));
      await expect(service.start('u1', 'k6', dto, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a lost concurrency race (unique index) to 409 instead of a second active row', async () => {
      prisma.customerVerification.create.mockRejectedValue(p2002('customer_verifications_one_active_per_user'));
      await expect(service.start('u1', 'k7', dto, {})).rejects.toThrow(/قيد المعالجة/);
    });

    it('never lets the provider mark the customer verified', async () => {
      provider.startVerification.mockResolvedValue({ providerReference: 'X', status: 'VERIFIED' });
      const { verification } = await service.start('u1', 'k8', dto, {});
      expect(verification.status).toBe('PENDING');
      expect(verification.isVerified).toBe(false);
    });

    it('keeps the request usable when the provider fails (internal queue)', async () => {
      provider.startVerification.mockRejectedValue(new Error('provider down'));
      const { verification } = await service.start('u1', 'k9', dto, {});
      expect(verification.status).toBe('PENDING');
      expect(audit.log).toHaveBeenCalled();
    });
  });

  /* --------------------------------- cancel -------------------------------- */

  describe('cancel', () => {
    it('cancels an active request and tells the provider', async () => {
      setStored(row({ status: 'IN_REVIEW' }));
      const result = await service.cancel('u1');
      expect(result.status).toBe('CANCELLED');
      expect(result.canCancel).toBe(false);
      expect(provider.cancelVerification).toHaveBeenCalledWith('LOG-cv1-A1');
      expect(actions()).toEqual(['VERIFICATION_CANCELLED']);
    });

    it('404s when there is nothing to cancel', async () => {
      await expect(service.cancel('u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to cancel from a non-cancellable state', async () => {
      for (const status of ['VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
        setStored(row({ status, completedAt: new Date() }));
        await expect(service.cancel('u1')).rejects.toBeInstanceOf(ConflictException);
      }
    });
  });

  /* ------------------------------ admin flow ------------------------------- */

  describe('admin workflow', () => {
    const actor = { id: 'emp1', isStaff: true };

    it('PENDING → IN_REVIEW records the reviewer', async () => {
      setStored(row());
      const result = await service.review('cv1', actor, {});
      expect(result.status).toBe('IN_REVIEW');
      expect(prisma.customerVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'IN_REVIEW', reviewedBy: 'emp1' }) }),
      );
      expect(actions()).toEqual(['VERIFICATION_REVIEWED']);
    });

    it('rejects reviewing anything that is not PENDING', async () => {
      for (const status of ['IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
        setStored(row({ status, completedAt: new Date() }));
        await expect(service.review('cv1', actor, {})).rejects.toBeInstanceOf(ConflictException);
      }
    });

    it('IN_REVIEW → VERIFIED is recorded as MANUAL, never as provider verified', async () => {
      setStored(row({ status: 'IN_REVIEW' }));
      const result = await service.verify('cv1', actor, {});
      expect(result).toMatchObject({ status: 'VERIFIED', source: 'MANUAL', isVerified: true });
      expect(audit.log.mock.calls[0][0].metadata).toMatchObject({ source: 'MANUAL', provider: 'LOG' });
    });

    it('refuses to verify a request that is not under review', async () => {
      for (const status of ['PENDING', 'VERIFIED', 'REJECTED', 'CANCELLED']) {
        setStored(row({ status, completedAt: new Date() }));
        await expect(service.verify('cv1', actor, {})).rejects.toBeInstanceOf(ConflictException);
      }
    });

    it('IN_REVIEW → REJECTED keeps the mandatory reason', async () => {
      setStored(row({ status: 'IN_REVIEW' }));
      const result = await service.reject('cv1', actor, 'الاسم لا يطابق', {});
      expect(result).toMatchObject({ status: 'REJECTED', rejectionReason: 'الاسم لا يطابق', isVerified: false });
      expect(actions()).toEqual(['VERIFICATION_REJECTED']);
    });

    it('refuses to reject straight from PENDING', async () => {
      setStored(row());
      await expect(service.reject('cv1', actor, 'reason', {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s on an unknown id', async () => {
      await expect(service.verify('nope', actor, {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /* -------------------------------- leaking -------------------------------- */

  it('never returns sensitive or provider-secret fields', async () => {
    setStored(row());
    const payload = JSON.stringify(await service.getMine('u1'));
    for (const forbidden of [
      'passwordHash', 'tokenHash', 'authorization', 'apiKey', 'api_key', 'secret', 'refreshToken', 'headers',
    ]) {
      expect(`${forbidden}:${payload.includes(forbidden)}`).toBe(`${forbidden}:false`);
    }
  });

  it('audits metadata without secrets', async () => {
    await service.start('u1', 'k10', { locale: 'ar' }, { ip: '127.0.0.1' });
    for (const call of audit.log.mock.calls) {
      const metadata = JSON.stringify(call[0].metadata);
      for (const forbidden of ['passwordHash', 'tokenHash', 'authorization', 'apiKey', 'secret']) {
        expect(`${forbidden}:${metadata.includes(forbidden)}`).toBe(`${forbidden}:false`);
      }
    }
  });
});
