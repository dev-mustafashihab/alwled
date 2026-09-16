import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 9 — Customer Verification architecture (e2e).
 * Real DB + real guards + real throttle. Proves:
 *  - the only provider is the internal LOG provider (no external call, never VERIFIED);
 *  - no customer-reachable path can fake a verification result;
 *  - ownership isolation, RBAC, idempotency, rate limiting and lazy expiry hold;
 *  - the state machine rejects every undocumented transition;
 *  - payments/orders/inventory are untouched.
 */
describe('Customer verification (e2e)', () => {
  let app: INestApplication;
  let http: () => request.Agent;
  let prisma: PrismaClient;
  let openApi: { paths: Record<string, any> };

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const phones = {
    a: `0321${stamp}`, b: `0322${stamp}`, c: `0323${stamp}`, d: `0324${stamp}`,
    staffReader: `0325${stamp}`, staffNoPerm: `0326${stamp}`,
  };
  const emails = Object.fromEntries(
    Object.entries(phones).map(([who, phone]) => [who, `ver.${who}.${stamp}@alwled.test`]),
  ) as Record<keyof typeof phones, string>;

  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let seq = 0;
  const nextKey = () => `ver-${stamp}-${++seq}`;
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  /** Every start call goes through here so the rate-limit test can count precisely. */
  let startCalls = 0;
  const aStartKey = `ver-${stamp}-astart`;
  const startReq = (who: string, body: Record<string, unknown> = {}, key = nextKey(), withKey = true) => {
    // The throttle counts requests per IP, so every start call (helper or raw) is counted here.
    startCalls += 1;
    const req = http().post('/api/v1/verification/start').set(auth(who));
    if (withKey) req.set('Idempotency-Key', key);
    return req.send(body);
  };

  const activeCount = (userId: string) =>
    prisma.customerVerification.count({ where: { userId, status: { in: ['PENDING', 'IN_REVIEW'] } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    http = () => request(app.getHttpServer());
    prisma = new PrismaClient();
    // Same document main.ts publishes at /api/docs (Swagger is installed in bootstrap).
    openApi = SwaggerModule.createDocument(
      app, new DocumentBuilder().setTitle('Alwled Store API').setVersion('0.1').addBearerAuth().build(),
    );

    const ownerLogin = await http()
      .post('/api/v1/auth/login')
      .send({ phone: process.env.SEED_OWNER_PHONE, password: process.env.SEED_OWNER_PASSWORD });
    tokens.owner = ownerLogin.body.data.accessToken;

    for (const who of ['a', 'b', 'c', 'd'] as const) {
      const reg = await http().post('/api/v1/auth/register').send({
        firstName: 'Ver', lastName: `T${who.toUpperCase()}`, email: emails[who], phone: phones[who],
        password: pass, confirmPassword: pass,
      });
      expect(reg.status).toBe(201);
      const login = await http().post('/api/v1/auth/login').send({ phone: phones[who], password: pass });
      expect(login.status).toBe(200);
      tokens[who] = login.body.data.accessToken;
      const me = await http().get('/api/v1/auth/me').set(auth(who));
      expect(me.status).toBe(200);
      userIds[who] = me.body.data.id;
    }

    // staff without any verification permission
    await http().post('/api/v1/roles').set(auth('owner')).send({
      name: `VERNOPERM_${stamp}`, description: 'بدون صلاحيات تحقق',
    });
    await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Ver', lastName: 'NoPerm', email: emails.staffNoPerm, phone: phones.staffNoPerm,
      password: pass, roleName: `VERNOPERM_${stamp}`,
    });
    // staff with verification.read + verification.update (ADMIN is seeded with both)
    await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Ver', lastName: 'Reader', email: emails.staffReader, phone: phones.staffReader,
      password: pass, roleName: 'ADMIN',
    });

    for (const who of ['staffNoPerm', 'staffReader'] as const) {
      const login = await http().post('/api/v1/auth/login').send({ phone: phones[who], password: pass });
      expect(login.status).toBe(200);
      tokens[who] = login.body.data.accessToken;
      const me = await http().get('/api/v1/auth/me').set(auth(who));
      userIds[who] = me.body.data.id;
    }
  }, 180000);

  afterAll(async () => {
    try {
      const users = await prisma.user.findMany({
        where: { OR: [{ phone: { in: Object.values(phones) } }, { email: { in: Object.values(emails) } }] },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: ids } } });
      await prisma.customerVerification.deleteMany({ where: { userId: { in: ids } } });
      // Users first: a role cannot be deleted while a user still references it.
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.role.deleteMany({ where: { name: `VERNOPERM_${stamp}`, isSystem: false } });
      await prisma.$disconnect();
    } catch (error) {
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  /* ------------------------- platform & provider ------------------------- */

  describe('platform', () => {
    it('serves health', async () => {
      expect((await http().get('/api/v1/health')).status).toBe(200);
    });

    it('documents every verification route in OpenAPI', async () => {
      const paths = Object.keys(openApi.paths ?? {});
      for (const path of [
        '/api/v1/verification/me', '/api/v1/verification/start', '/api/v1/verification/cancel',
        '/api/v1/admin/verifications', '/api/v1/admin/verifications/{id}',
        '/api/v1/admin/verifications/{id}/review', '/api/v1/admin/verifications/{id}/verify',
        '/api/v1/admin/verifications/{id}/reject',
      ]) {
        expect(`${path}:${paths.includes(path)}`).toBe(`${path}:true`);
      }
      const start = openApi.paths['/api/v1/verification/start'].post;
      expect(JSON.stringify(start.responses)).toContain('409');
      expect(JSON.stringify(start.responses)).toContain('429');
    });

    it('exposes a LOG provider and never an external one', async () => {
      const res = await http().get('/api/v1/verification/me').set(auth('a'));
      expect(res.body.data.providerConfigured).toBe('LOG');
      expect(res.body.data.externalProvider).toBe(false);
    });
  });

  /* -------------------------------- customer ------------------------------- */

  describe('customer flow', () => {
    it('reports NOT_STARTED before any request', async () => {
      const res = await http().get('/api/v1/verification/me').set(auth('a'));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: null, status: 'NOT_STARTED', canStart: true, canCancel: false, isVerified: false,
      });
    });

    it('requires authentication', async () => {
      expect((await http().get('/api/v1/verification/me')).status).toBe(401);
      // Unauthenticated start: throttled before auth, so it counts towards the budget too.
      startCalls += 1;
      expect((await http().post('/api/v1/verification/start').send({})).status).toBe(401);
      expect((await http().post('/api/v1/verification/cancel').send({})).status).toBe(401);
    });

    it('starts a PENDING request with an internal provider reference', async () => {
      const res = await startReq('a', { locale: 'ar' }, aStartKey);
      expect(res.status).toBe(201);
      const data = res.body.data.verification ?? res.body.data;
      expect(data.status).toBe('PENDING');
      expect(data.provider).toBe('LOG');
      expect(data.providerReference).toMatch(/^LOG-/);
      expect(data.source).toBe('SYSTEM');
      expect(data.attempt).toBe(1);
      expect(data.isVerified).toBe(false);
      userIds.aVerification = data.id;
    });

    it('returns the same request from /me', async () => {
      const res = await http().get('/api/v1/verification/me').set(auth('a'));
      expect(res.body.data.id).toBe(userIds.aVerification);
      expect(res.body.data).toMatchObject({ status: 'PENDING', canCancel: true, canStart: false });
    });

    it('replays the same record for the same key and payload', async () => {
      const replay = await startReq('a', { locale: 'ar' }, aStartKey);
      expect([200, 201]).toContain(replay.status);
      expect(replay.body.data.replayed).toBe(true);
      expect(replay.body.data.verification.id).toBe(userIds.aVerification);

      const replayedAgain = await startReq('a', { locale: 'ar' }, aStartKey);
      expect(replayedAgain.body.data.replayed).toBe(true);
      expect(replayedAgain.body.data.verification.id).toBe(userIds.aVerification);
    });

    it('rejects the same key with a different payload', async () => {
      const res = await startReq('a', { locale: 'fr' }, aStartKey);
      expect(res.status).toBe(409);
    });

    it('refuses a second active request', async () => {
      const res = await startReq('a');
      expect(res.status).toBe(409);
      expect(await activeCount(userIds.a)).toBe(1);
    });

    it('rejects client-supplied userId, status or providerReference', async () => {
      const rejected: Record<string, number> = {};
      for (const [label, body] of [
        ['userId', { userId: userIds.b }],
        ['status', { status: 'VERIFIED' }],
        ['verified', { verified: true }],
        ['providerReference', { providerReference: 'whatever' }],
        ['provider', { provider: 'REAL' }],
      ] as [string, Record<string, unknown>][]) {
        rejected[label] = (await startReq('a', body)).status;
      }
      expect(rejected).toEqual({
        userId: 400, status: 400, verified: 400, providerReference: 400, provider: 400,
      });
    });

    it('validates the DTO', async () => {
      expect((await startReq('a', { locale: 'x'.repeat(20) })).status).toBe(400);
      expect((await startReq('a', { acceptedTerms: 'yes' })).status).toBe(400);
      const noKey = await startReq('a', {}, nextKey(), false);
      expect(noKey.status).toBe(409);
      expect(await activeCount(userIds.a)).toBe(1);
    });

    it('exposes no customer endpoint that can fake a verification', async () => {
      for (const path of ['/api/v1/verification/success', '/api/v1/verification/verify', '/api/v1/verification/mock-success']) {
        const res = await http().post(path).set(auth('a')).send({ status: 'VERIFIED' });
        expect(`${path}:${res.status}`).toBe(`${path}:404`);
      }
      const me = await http().get('/api/v1/verification/me').set(auth('a'));
      expect(me.body.data.isVerified).toBe(false);
    });

    it('isolates ownership: another customer\'s id is a 404', async () => {
      const res = await http().get(`/api/v1/verification/${userIds.aVerification}`).set(auth('b'));
      expect(res.status).toBe(404);
      const own = await http().get(`/api/v1/verification/${userIds.aVerification}`).set(auth('a'));
      expect(own.status).toBe(200);
      expect(own.body.data.id).toBe(userIds.aVerification);
    });

    it('cancels the active request and treats CANCELLED as terminal', async () => {
      const res = await http().post('/api/v1/verification/cancel').set(auth('a')).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect((await http().post('/api/v1/verification/cancel').set(auth('a')).send({})).status).toBe(409);
      expect((await startReq('a')).status).toBe(409); // no CANCELLED → PENDING in the machine
    });
  });

  /* ------------------------------ state machine ---------------------------- */

  describe('state machine', () => {
    it('expires lazily on read and allows a retry afterwards', async () => {
      const started = await startReq('b');
      expect(started.status).toBe(201);
      const id = (started.body.data.verification ?? started.body.data).id;
      userIds.bVerification = id;

      await prisma.customerVerification.update({
        where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const me = await http().get('/api/v1/verification/me').set(auth('b'));
      expect(me.body.data.status).toBe('EXPIRED');
      const stored = await prisma.customerVerification.findUnique({ where: { id }, select: { status: true, completedAt: true } });
      expect(stored?.status).toBe('EXPIRED');
      expect(stored?.completedAt).not.toBeNull();

      const retry = await startReq('b');
      expect(retry.status).toBe(201);
      const data = retry.body.data.verification ?? retry.body.data;
      expect(data.id).toBe(id); // same record, next attempt
      expect(data.attempt).toBe(2);
      expect(data.status).toBe('PENDING');
    });

    it('refuses to cancel from REJECTED', async () => {
      const admin = await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/review`)
        .set(auth('staffReader')).send({});
      expect(admin.status).toBe(200);
      const rejected = await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/reject`)
        .set(auth('staffReader')).send({ reason: 'صورة غير واضحة' });
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('REJECTED');
      const cancel = await http().post('/api/v1/verification/cancel').set(auth('b')).send({});
      expect(cancel.status).toBe(409);
      const me = await http().get('/api/v1/verification/me').set(auth('b'));
      expect(me.body.data).toMatchObject({ status: 'REJECTED', canStart: true, rejectionReason: 'صورة غير واضحة' });
    });

    it('allows a retry after REJECTED and refuses undocumented jumps', async () => {
      const retry = await startReq('b');
      expect(retry.status).toBe(201);
      expect((retry.body.data.verification ?? retry.body.data).attempt).toBe(3);
      // rejecting straight from PENDING is not a documented transition
      const early = await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/reject`)
        .set(auth('staffReader')).send({ reason: 'مبكر جداً' });
      expect(early.status).toBe(409);
      const verifyEarly = await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/verify`)
        .set(auth('staffReader')).send({});
      expect(verifyEarly.status).toBe(409);
    });

    it('never moves a cancelled request anywhere else', async () => {
      const me = await http().get('/api/v1/verification/me').set(auth('a'));
      expect(me.body.data.status).toBe('CANCELLED');
      expect((await startReq('a')).status).toBe(409);
      expect((await http().post('/api/v1/verification/cancel').set(auth('a')).send({})).status).toBe(409);
    });
  });

  /* -------------------------------- admin --------------------------------- */

  describe('admin', () => {
    it('denies customers and unprivileged staff', async () => {
      expect((await http().get('/api/v1/admin/verifications').set(auth('a'))).status).toBe(403);
      expect((await http().get('/api/v1/admin/verifications').set(auth('staffNoPerm'))).status).toBe(403);
      expect((await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/review`).set(auth('staffNoPerm')).send({})).status).toBe(403);
      expect((await http().get(`/api/v1/admin/verifications/${userIds.bVerification}`).set(auth('staffNoPerm'))).status).toBe(403);
      expect((await http().get('/api/v1/admin/verifications')).status).toBe(401);
    });

    it('lists and filters for a privileged admin', async () => {
      const res = await http().get('/api/v1/admin/verifications?status=PENDING&limit=50').set(auth('staffReader'));
      expect(res.status).toBe(200);
      expect(res.body.data.meta.total).toBeGreaterThanOrEqual(1);
      for (const item of res.body.data.items) expect(item.status).toBe('PENDING');
      const mine = await http().get(`/api/v1/admin/verifications?userId=${userIds.bVerification ? userIds.b : ''}`).set(auth('staffReader'));
      expect(mine.status).toBe(200);
    });

    it('reviews and verifies manually, recording MANUAL as the source', async () => {
      const review = await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/review`)
        .set(auth('staffReader')).send({});
      expect(review.status).toBe(200);
      expect(review.body.data.status).toBe('IN_REVIEW');
      expect(review.body.data.reviewedAt).not.toBeNull();

      const doubleReview = await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/review`)
        .set(auth('staffReader')).send({});
      expect(doubleReview.status).toBe(409);

      const verified = await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/verify`)
        .set(auth('staffReader')).send({});
      expect(verified.status).toBe(200);
      expect(verified.body.data).toMatchObject({ status: 'VERIFIED', source: 'MANUAL', isVerified: true });

      const again = await http().post(`/api/v1/admin/verifications/${userIds.bVerification}/verify`)
        .set(auth('staffReader')).send({});
      expect(again.status).toBe(409);
    });

    it('shows a verified customer the VERIFIED state, and blocks further starts', async () => {
      const me = await http().get('/api/v1/verification/me').set(auth('b'));
      expect(me.body.data).toMatchObject({ status: 'VERIFIED', isVerified: true, canStart: false, canCancel: false });
      const start = await startReq('b');
      expect(start.status).toBe(409);
    });

    it('requires a rejection reason and rejects unknown ids', async () => {
      const started = await startReq('c');
      const id = (started.body.data.verification ?? started.body.data).id;
      userIds.cVerification = id;
      await http().post(`/api/v1/admin/verifications/${id}/review`).set(auth('staffReader')).send({});
      expect((await http().post(`/api/v1/admin/verifications/${id}/reject`).set(auth('staffReader')).send({})).status).toBe(400);
      expect((await http().post(`/api/v1/admin/verifications/${id}/reject`).set(auth('staffReader')).send({ reason: 'x' })).status).toBe(400);
      expect((await http().post('/api/v1/admin/verifications/does-not-exist/review').set(auth('staffReader')).send({})).status).toBe(404);
    });
  });

  /* ------------------------------ concurrency ------------------------------ */

  describe('concurrency', () => {
    it('two parallel starts produce exactly one active verification', async () => {
      const who = 'd';
      await prisma.customerVerification.deleteMany({ where: { userId: userIds[who] } });
      const [first, second] = await Promise.all([startReq(who), startReq(who)]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);
      expect(await activeCount(userIds[who])).toBe(1);
    });

    it('the database itself enforces one active row per user', async () => {
      const existing = await prisma.customerVerification.findFirst({
        where: { userId: userIds.d, status: { in: ['PENDING', 'IN_REVIEW'] } }, select: { id: true },
      });
      expect(existing).not.toBeNull();
      await expect(
        prisma.customerVerification.create({
          data: { userId: userIds.d, status: 'PENDING', provider: 'LOG' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  /* --------------------------------- audit --------------------------------- */

  describe('audit', () => {
    it('records the workflow events with sources', async () => {
      const rows = await prisma.auditLog.findMany({
        where: { entity: 'verification', entityId: { in: [userIds.aVerification, userIds.bVerification, userIds.cVerification].filter(Boolean) as string[] } },
        select: { action: true, actorId: true, metadata: true },
      });
      const actions = rows.map((r) => r.action);
      for (const expected of [
        'VERIFICATION_STARTED', 'VERIFICATION_SUBMITTED', 'VERIFICATION_CANCELLED',
        'VERIFICATION_EXPIRED', 'VERIFICATION_REVIEWED', 'VERIFICATION_REJECTED', 'VERIFICATION_VERIFIED',
      ]) {
        expect(`${expected}:${actions.includes(expected)}`).toBe(`${expected}:true`);
      }
      const verified = rows.find((r) => r.action === 'VERIFICATION_VERIFIED');
      expect((verified?.metadata as Record<string, unknown>)?.source).toBe('MANUAL');
      const expired = rows.find((r) => r.action === 'VERIFICATION_EXPIRED');
      expect((expired?.metadata as Record<string, unknown>)?.source).toBe('SYSTEM');
      expect(rows.every((r) => r.actorId !== null || r.action === 'VERIFICATION_EXPIRED')).toBe(true);
    });

    it('never stores secrets or tokens in audit metadata', async () => {
      const rows = await prisma.auditLog.findMany({
        where: { entity: 'verification' }, select: { metadata: true },
        orderBy: { createdAt: 'desc' }, take: 50,
      });
      for (const row of rows) {
        const json = JSON.stringify(row.metadata ?? {});
        for (const forbidden of ['passwordHash', 'tokenHash', 'authorization', 'apiKey', 'api_key', 'secret', 'refreshToken']) {
          expect(`${forbidden}:${json.includes(forbidden)}`).toBe(`${forbidden}:false`);
        }
      }
    });
  });

  /* ------------------------------ no leakage ------------------------------- */

  it('returns no sensitive fields and leaves other domains untouched', async () => {
    const ordersBefore = await prisma.order.count({ where: { userId: userIds.a } });
    const paymentsBefore = await prisma.payment.count({ where: { userId: userIds.a } });

    const responses = await Promise.all([
      http().get('/api/v1/verification/me').set(auth('a')),
      http().get('/api/v1/admin/verifications?limit=5').set(auth('staffReader')),
      http().get(`/api/v1/admin/verifications/${userIds.bVerification}`).set(auth('staffReader')),
    ]);
    for (const res of responses) {
      const json = JSON.stringify(res.body);
      for (const forbidden of ['passwordHash', 'tokenHash', 'authorization', 'apiKey', 'api_key', 'secret', 'refreshToken']) {
        expect(`${forbidden}:${json.includes(forbidden)}`).toBe(`${forbidden}:false`);
      }
    }

    expect(await prisma.order.count({ where: { userId: userIds.a } })).toBe(ordersBefore);
    expect(await prisma.payment.count({ where: { userId: userIds.a } })).toBe(paymentsBefore);
    const user = await prisma.user.findUnique({ where: { id: userIds.b }, select: { isVerified: true } });
    expect(user?.isVerified).toBe(false); // account flag is untouched by identity verification
  });

  /* ------------------------------ rate limits ------------------------------ */

  describe('rate limiting', () => {
    it('throttles POST /verification/start exactly at the configured budget', async () => {
      const budget = Number(process.env.RATE_VERIFICATION_START_MAX ?? 10);
      const before = startCalls;
      let attempts = 0;
      let status = 0;
      while (status !== 429 && attempts < budget + 5) {
        status = (await startReq('d')).status;
        attempts += 1;
      }
      // The (budget + 1)-th request inside the window is the throttled one.
      expect({ status, callsInWindow: before + attempts }).toEqual({ status: 429, callsInWindow: budget + 1 });
    });
  });
});
